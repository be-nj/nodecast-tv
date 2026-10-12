const test = require('node:test');
const assert = require('node:assert');
const { analyzeProbeResult } = require('../server/routes/probe.js');
const { TranscodeSession } = require('../server/services/transcodeSession.js');

const probe = (fieldOrder, audio = 'aac') => ({
    streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, field_order: fieldOrder },
        { codec_type: 'audio', codec_name: audio, channels: 2 },
    ],
    format: { format_name: 'mpegts' },
});

test('interlaced broadcasts need transcoding even with browser codecs', () => {
    const kinowelt = analyzeProbeResult(probe('tt'), 'http://dispatcharr/proxy/ts/stream/x');
    assert.strictEqual(kinowelt.interlaced, true);
    assert.strictEqual(kinowelt.needsTranscode, true);
});

test('progressive and unknown field order stay on the copy path', () => {
    for (const order of ['progressive', 'unknown', undefined]) {
        const result = analyzeProbeResult(probe(order), 'http://dispatcharr/proxy/ts/stream/x');
        assert.strictEqual(result.interlaced, false);
        assert.strictEqual(result.needsTranscode, false);
    }
});

test('deinterlacing runs before scaling, per encoder', () => {
    const session = new TranscodeSession('http://x/proxy/ts/stream/y', { deinterlace: true });
    assert.strictEqual(session.buildScaleFilter('vaapi', 1080), 'deinterlace_vaapi=rate=field,scale_vaapi=w=-2:h=1080:format=nv12');
    assert.strictEqual(session.buildScaleFilter('software', 720), 'yadif=mode=send_field,scale=-2:720');
    const plain = new TranscodeSession('http://x/proxy/ts/stream/y', {});
    assert.strictEqual(plain.buildScaleFilter('vaapi', 1080), 'scale_vaapi=w=-2:h=1080:format=nv12');
});

test('live TS copy needs no Annex B filter, whatever the probe said', () => {
    const live = new TranscodeSession('http://dispatcharr:9191/proxy/ts/stream/abc', { videoMode: 'copy', videoCodec: 'hevc', userAgent: 'x' });
    const args = live.buildFFmpegArgs();
    assert.ok(!args.includes('-bsf:v'), args.join(' '));
    const file = new TranscodeSession('http://host/movie.mkv', { videoMode: 'copy', videoCodec: 'hevc', userAgent: 'x' });
    assert.ok(file.buildFFmpegArgs().includes('hevc_mp4toannexb'));
});
