/**
 * Stream variant selection.
 *
 * Picks, per device, which of a channel's provider streams (FHD/HD/SD/UHD,
 * h264/HEVC) to play first, so the video can be copied instead of transcoded.
 * Loaded as a plain script in the browser (window.StreamVariants) and via
 * require() in tests.
 */
(function (root) {
    const PREF_HEVC = 'nodecast.hevcMode';           // 'auto' | 'never' | 'always'
    const PREF_MAX_HEIGHT = 'nodecast.maxDirectHeight'; // '1080' | '2160'

    /**
     * What this device can decode via MSE (hls.js plays through MSE).
     */
    function detectCaps(win) {
        const MS = win && (win.ManagedMediaSource || win.MediaSource);
        const supported = (codec) => {
            try {
                return !!MS && MS.isTypeSupported(`video/mp4; codecs="${codec}"`);
            } catch (e) {
                return false;
            }
        };
        return {
            hevc: supported('hvc1.1.6.L120.90') || supported('hev1.1.6.L120.90'),
            hevc4k: supported('hvc1.1.6.L153.90') || supported('hev1.1.6.L153.90'),
        };
    }

    function loadPrefs(storage) {
        const read = (key) => {
            try { return storage && storage.getItem(key); } catch (e) { return null; }
        };
        const hevcMode = read(PREF_HEVC);
        const maxHeight = Number(read(PREF_MAX_HEIGHT));
        return {
            hevcMode: ['auto', 'never', 'always'].includes(hevcMode) ? hevcMode : 'auto',
            maxHeight: maxHeight === 2160 ? 2160 : 1080,
        };
    }

    function savePrefs(storage, prefs) {
        try {
            if (prefs.hevcMode) storage.setItem(PREF_HEVC, prefs.hevcMode);
            if (prefs.maxHeight) storage.setItem(PREF_MAX_HEIGHT, String(prefs.maxHeight));
        } catch (e) { /* private mode - keep defaults */ }
    }

    /** Whether HEVC at the given height may be played directly. */
    function hevcAllowed(height, caps, prefs) {
        if (prefs.hevcMode === 'never') return false;
        if (prefs.hevcMode === 'always') return true;
        return height > 1080 ? !!caps.hevc4k : !!caps.hevc;
    }

    function heightFromName(name) {
        const last = String(name || '').trim().split(/\s+/).pop().toUpperCase();
        return { UHD: 2160, '4K': 2160, FHD: 1080, HD: 720, SD: 576 }[last] || 720;
    }

    /**
     * Order variants for this device: directly playable ones first (highest
     * resolution, h264 before HEVC at equal resolution), then variants whose
     * codec is unknown, then everything else in the server's order as a last
     * resort (those need transcoding).
     */
    function rankVariants(variants, caps, prefs) {
        const scored = (variants || []).map((v, index) => {
            const height = v.height || heightFromName(v.name);
            // Unprobed UHD streams are HEVC at the providers seen so far
            const codec = v.codec || (height > 1080 ? 'hevc' : null);
            let tier;
            if (height > prefs.maxHeight) {
                tier = 3;
            } else if (codec === 'h264') {
                tier = 0;
            } else if (codec === 'hevc') {
                tier = hevcAllowed(height, caps, prefs) ? 0 : 3;
            } else {
                // Unknown codec: only safe up front if HEVC would play anyway
                tier = hevcAllowed(height, caps, prefs) ? 0 : 1;
            }
            return { v, index, tier, height, h264: codec === 'h264' ? 0 : 1 };
        });
        scored.sort((a, b) =>
            a.tier - b.tier ||
            (a.tier === 3 ? a.index - b.index : (b.height - a.height) || (a.h264 - b.h264) || (a.index - b.index))
        );
        return scored.map(s => s.v);
    }

    const PREF_CHOICE = 'nodecast.variant.'; // + channel key -> stream hash

    /** "UHD", "FHD", "HD" or "SD" for the quality menu. */
    function qualityTag(v) {
        const last = String(v.name || '').trim().split(/\s+/).pop().toUpperCase();
        if (['UHD', '4K', 'FHD', 'HD', 'SD'].includes(last)) return last === '4K' ? 'UHD' : last;
        const h = v.height || 0;
        return h >= 2160 ? 'UHD' : h >= 1080 ? 'FHD' : h >= 720 ? 'HD' : h > 0 ? 'SD' : (v.name || '?');
    }

    /** The stream the viewer fixed for a channel, or null for automatic. */
    function loadChoice(storage, channelKey) {
        try { return (storage && channelKey && storage.getItem(PREF_CHOICE + channelKey)) || null; } catch (e) { return null; }
    }

    function saveChoice(storage, channelKey, hash) {
        try {
            if (hash) storage.setItem(PREF_CHOICE + channelKey, hash);
            else storage.removeItem(PREF_CHOICE + channelKey);
        } catch (e) { /* private mode - choice lasts until reload */ }
    }

    /**
     * The ranked list with the viewer's pick first. The rest keep their
     * order, so a pick that fails still falls back to the best other one.
     */
    function applyChoice(ranked, hash) {
        const chosen = hash && ranked.find(v => v.hash === hash);
        return chosen ? [chosen, ...ranked.filter(v => v !== chosen)] : ranked;
    }

    const api = {
        detectCaps, loadPrefs, savePrefs, hevcAllowed, rankVariants, heightFromName,
        qualityTag, loadChoice, saveChoice, applyChoice, PREF_HEVC, PREF_MAX_HEIGHT,
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.StreamVariants = api;
    }
})(typeof window !== 'undefined' ? window : this);
