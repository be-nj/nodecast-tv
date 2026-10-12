const test = require('node:test');
const assert = require('node:assert');
const { analyzeProbeResult } = require('../server/routes/probe.js');
const { TranscodeSession } = require('../server/services/transcodeSession.js');

// rates as ffprobe reports them: Kinowelt (PAFF) shows r_frame_rate 50/1
// against avg_frame_rate 25/1, frame-coded 1080i (MBAFF) 25/1 for both.
const probe = (fieldOrder, rFrameRate = '25/1', avgFrameRate = '25/1', audio = 'aac') => ({
    streams: [
        {
            codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080,
            field_order: fieldOrder, r_frame_rate: rFrameRate, avg_frame_rate: avgFrameRate,
        },
        { codec_type: 'audio', codec_name: audio, channels: 2 },
    ],
    format: { format_name: 'mpegts' },
});
const URL = 'http://dispatcharr/proxy/ts/stream/x';

test('field-coded interlaced video needs transcoding even with browser codecs', () => {
    const kinowelt = analyzeProbeResult(probe('tt', '50/1', '25/1'), URL);
    assert.strictEqual(kinowelt.interlaced, true);
    assert.strictEqual(kinowelt.fieldCoded, true);
    assert.strictEqual(kinowelt.needsTranscode, true);
});

test('frame-coded interlaced video stays on the copy path', () => {
    const mbaff = analyzeProbeResult(probe('tt', '25/1', '25/1'), URL);
    assert.strictEqual(mbaff.interlaced, true);
    assert.strictEqual(mbaff.fieldCoded, false);
    assert.strictEqual(mbaff.needsTranscode, false);
    const noRates = analyzeProbeResult(probe('bb', undefined, '0/0'), URL);
    assert.strictEqual(noRates.fieldCoded, false);
});

test('progressive and unknown field order stay on the copy path', () => {
    for (const order of ['progressive', 'unknown', undefined]) {
        const result = analyzeProbeResult(probe(order, '50/1', '25/1'), URL);
        assert.strictEqual(result.interlaced, false);
        assert.strictEqual(result.fieldCoded, false);
        assert.strictEqual(result.needsTranscode, false);
    }
});

test('deinterlacing runs before scaling, one frame per field on every encoder', () => {
    const session = new TranscodeSession('http://x/proxy/ts/stream/y', { deinterlace: true });
    assert.strictEqual(session.buildScaleFilter('vaapi', 1080), 'deinterlace_vaapi=rate=field,scale_vaapi=w=-2:h=1080:format=nv12');
    assert.strictEqual(session.buildScaleFilter('software', 720), 'yadif=mode=send_field,scale=-2:720');
    assert.match(session.buildScaleFilter('qsv', 1080), /^vpp_qsv=deinterlace=2:rate=field,/);
    const plain = new TranscodeSession('http://x/proxy/ts/stream/y', {});
    assert.strictEqual(plain.buildScaleFilter('vaapi', 1080), 'scale_vaapi=w=-2:h=1080:format=nv12');
});

test('software 50p output is labelled with a level that allows it', () => {
    const level = (options) => {
        const args = [];
        new TranscodeSession('http://x/proxy/ts/stream/y', options).addSoftwareEncoderArgs(args, 1080, 23);
        return args[args.indexOf('-level') + 1];
    };
    assert.strictEqual(level({ deinterlace: true }), '4.2');
    assert.strictEqual(level({}), '4.1');
});

test('video copy never forces an Annex B filter, whatever the probe said', () => {
    for (const url of ['http://dispatcharr:9191/proxy/ts/stream/abc', 'http://host/movie.mkv']) {
        for (const videoCodec of ['hevc', 'h264', 'unknown']) {
            const args = new TranscodeSession(url, { videoMode: 'copy', videoCodec, userAgent: 'x' }).buildFFmpegArgs();
            assert.ok(!args.includes('-bsf:v'), args.join(' '));
        }
    }
});

test('probes of Dispatcharr channel URLs are not cached, stream hashes are', () => {
    const { isCacheable } = require('../server/routes/probe.js');
    const ok = { audio: 'aac' };
    assert.strictEqual(isCacheable('http://d:9191/proxy/ts/stream/6c7c6d59-25df-49c8-a385-ac36a04ae7f9', ok), false);
    assert.strictEqual(isCacheable('http://d:9191/proxy/ts/stream/ef58325c1392e0761b2efb6dd63a2691f8e1a511f9b398029a6d95ab9a3bf2c9', ok), true);
    assert.strictEqual(isCacheable('http://host/movie.mkv', { audio: 'unknown' }), false);
});
