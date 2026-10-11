const test = require('node:test');
const assert = require('node:assert');
const SV = require('../public/js/utils/streamVariants');

const AUTO_1080 = { hevcMode: 'auto', maxHeight: 1080 };
const NO_HEVC = { hevc: false, hevc4k: false };
const HEVC_1080 = { hevc: true, hevc4k: false };
const HEVC_ALL = { hevc: true, hevc4k: true };

// RTL as seen at the provider: FHD is HEVC, HD is h264, UHD is HEVC 4K
const rtl = [
    { name: 'RTL FHD', codec: 'hevc', width: 1920, height: 1080 },
    { name: 'RTL HD', codec: 'h264', width: 1280, height: 720 },
    { name: 'RTL UHD', codec: null, width: null, height: null },
];
const names = list => list.map(v => v.name);

test('device without HEVC gets the h264 stream first', () => {
    assert.deepStrictEqual(names(SV.rankVariants(rtl, NO_HEVC, AUTO_1080)), ['RTL HD', 'RTL FHD', 'RTL UHD']);
});

test('HEVC device gets the 1080p HEVC stream first', () => {
    assert.deepStrictEqual(names(SV.rankVariants(rtl, HEVC_1080, AUTO_1080)), ['RTL FHD', 'RTL HD', 'RTL UHD']);
});

test('4K only when allowed by max resolution and the device', () => {
    const prefs4k = { hevcMode: 'auto', maxHeight: 2160 };
    assert.deepStrictEqual(names(SV.rankVariants(rtl, HEVC_ALL, prefs4k)), ['RTL UHD', 'RTL FHD', 'RTL HD']);
    assert.deepStrictEqual(names(SV.rankVariants(rtl, HEVC_1080, prefs4k)), ['RTL FHD', 'RTL HD', 'RTL UHD']);
});

test('hevcMode never forces h264 even on HEVC devices', () => {
    const prefs = { hevcMode: 'never', maxHeight: 1080 };
    assert.deepStrictEqual(names(SV.rankVariants(rtl, HEVC_ALL, prefs)), ['RTL HD', 'RTL FHD', 'RTL UHD']);
});

test('h264 beats HEVC at equal resolution', () => {
    const list = [
        { name: 'X FHD', codec: 'hevc', height: 1080 },
        { name: 'X FHD', codec: 'h264', height: 1080, hash: 'b' },
    ];
    assert.strictEqual(SV.rankVariants(list, HEVC_ALL, AUTO_1080)[0].hash, 'b');
});

test('unprobed variants rank after known h264 on devices without HEVC', () => {
    const list = [
        { name: 'ZDF FHD', codec: null, height: null },
        { name: 'ZDF HD', codec: 'h264', height: 720 },
    ];
    assert.deepStrictEqual(names(SV.rankVariants(list, NO_HEVC, AUTO_1080)), ['ZDF HD', 'ZDF FHD']);
    assert.deepStrictEqual(names(SV.rankVariants(list, HEVC_1080, AUTO_1080)), ['ZDF FHD', 'ZDF HD']);
});

test('prefs default to auto / 1080 and survive bad storage', () => {
    assert.deepStrictEqual(SV.loadPrefs(null), AUTO_1080);
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    SV.savePrefs(storage, { hevcMode: 'never', maxHeight: 2160 });
    assert.deepStrictEqual(SV.loadPrefs(storage), { hevcMode: 'never', maxHeight: 2160 });
    const broken = { getItem: () => { throw new Error('denied'); } };
    assert.deepStrictEqual(SV.loadPrefs(broken), AUTO_1080);
});

test('detectCaps asks MediaSource for HEVC 1080p and 4K', () => {
    const win = { MediaSource: { isTypeSupported: t => t.includes('hvc1.1.6.L120') } };
    assert.deepStrictEqual(SV.detectCaps(win), { hevc: true, hevc4k: false });
    assert.deepStrictEqual(SV.detectCaps({}), { hevc: false, hevc4k: false });
});
