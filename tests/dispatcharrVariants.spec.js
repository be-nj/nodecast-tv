const test = require('node:test');
const assert = require('node:assert');
const dv = require('../server/services/dispatcharrVariants');

const UUID = '8d2e9ca5-b2b9-442b-ace9-5546e4596a3b';
const CHANNEL_URL = `http://dispatcharr:9191/proxy/ts/stream/${UUID}`;

function withEnv(env, fn) {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    return Promise.resolve(fn()).finally(() => { process.env = saved; });
}

function mockFetch(t, handler) {
    const calls = [];
    t.mock.method(global, 'fetch', async (url, opts = {}) => {
        calls.push({ url, opts });
        const body = handler(url, opts);
        return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
    });
    return calls;
}

test('maps streams to proxy URLs by hash without leaking provider URLs', () => {
    const v = dv.toVariants('http://dispatcharr:9191', [
        { name: 'RTL FHD', url: 'http://provider/live/user/pass/1.ts', stream_hash: 'abc', stream_stats: { video_codec: 'hevc', resolution: '1920x1080' } },
        { name: 'RTL HD', url: 'http://provider/live/user/pass/2.ts', stream_hash: 'def', stream_stats: null },
        { name: 'no hash', stream_hash: null },
    ]);
    assert.deepStrictEqual(v, [
        { hash: 'abc', url: 'http://dispatcharr:9191/proxy/ts/stream/abc', name: 'RTL FHD', codec: 'hevc', width: 1920, height: 1080 },
        { hash: 'def', url: 'http://dispatcharr:9191/proxy/ts/stream/def', name: 'RTL HD', codec: null, width: null, height: null },
    ]);
    assert.ok(!JSON.stringify(v).includes('provider'));
});

test('normalizes codec names', () => {
    assert.strictEqual(dv.normalizeCodec('H264'), 'h264');
    assert.strictEqual(dv.normalizeCodec('avc'), 'h264');
    assert.strictEqual(dv.normalizeCodec('h265'), 'hevc');
    assert.strictEqual(dv.normalizeCodec('mpeg2video'), 'mpeg2video');
    assert.strictEqual(dv.normalizeCodec(undefined), null);
});

test('returns null without API key or for non-Dispatcharr URLs', async (t) => {
    const calls = mockFetch(t, () => ({}));
    await withEnv({ DISPATCHARR_API_KEY: undefined, DISPATCHARR_URL: undefined }, async () => {
        assert.strictEqual(await dv.getVariants(CHANNEL_URL), null);
    });
    await withEnv({ DISPATCHARR_API_KEY: 'k', DISPATCHARR_URL: undefined }, async () => {
        assert.strictEqual(await dv.getVariants('http://example.com/live/1.m3u8'), null);
    });
    assert.strictEqual(calls.length, 0);
});

test('never sends the key to a host other than DISPATCHARR_URL', async (t) => {
    const calls = mockFetch(t, () => ({}));
    await withEnv({ DISPATCHARR_API_KEY: 'k', DISPATCHARR_URL: 'http://dispatcharr:9191' }, async () => {
        assert.strictEqual(await dv.getVariants(`http://evil.example/proxy/ts/stream/${UUID}`), null);
    });
    assert.strictEqual(calls.length, 0);
});

test('looks up the channel by uuid and caches the result', async (t) => {
    dv._cache.clear();
    const calls = mockFetch(t, (url) => {
        if (url.endsWith('/api/channels/channels/by-uuids/')) return [{ id: 42 }];
        if (url.endsWith('/api/channels/channels/42/?include_streams=true')) {
            return { streams: [{ name: 'ZDF FHD', stream_hash: 'h1', stream_stats: { video_codec: 'h264', resolution: '1920x1080' } }] };
        }
        return undefined;
    });
    await withEnv({ DISPATCHARR_API_KEY: 'k', DISPATCHARR_URL: 'http://dispatcharr:9191' }, async () => {
        const first = await dv.getVariants(CHANNEL_URL);
        const second = await dv.getVariants(CHANNEL_URL);
        assert.strictEqual(first[0].url, 'http://dispatcharr:9191/proxy/ts/stream/h1');
        assert.strictEqual(second, first);
    });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].opts.headers['X-API-Key'], 'k');
    assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { uuids: [UUID] });
});
