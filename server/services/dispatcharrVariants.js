/**
 * Stream variants of a Dispatcharr channel.
 *
 * A Dispatcharr channel can hold several provider streams of the same station
 * (e.g. FHD/HD/SD/UHD). Dispatcharr itself always plays the first one; this
 * lets the player pick the best variant the current device can decode and
 * play it directly via /proxy/ts/stream/<stream_hash>.
 *
 * Needs DISPATCHARR_API_KEY (and optionally DISPATCHARR_URL); without them
 * getVariants() returns null and playback uses the channel URL as before.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // channel uuid -> { at, variants }

const CHANNEL_URL_RE = /^(https?:\/\/[^/]+)\/proxy\/ts\/stream\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i;

function config() {
    const apiKey = process.env.DISPATCHARR_API_KEY;
    const baseUrl = (process.env.DISPATCHARR_URL || '').replace(/\/+$/, '');
    return { apiKey, baseUrl };
}

function normalizeCodec(codec) {
    if (!codec) return null;
    const c = String(codec).toLowerCase();
    if (c.includes('264') || c === 'avc') return 'h264';
    if (c.includes('265') || c.includes('hevc')) return 'hevc';
    return c;
}

function parseResolution(resolution) {
    const m = /^(\d+)\s*x\s*(\d+)$/.exec(String(resolution || ''));
    return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: null, height: null };
}

/**
 * Map Dispatcharr stream objects (ordered as in the channel) to variants.
 * Never exposes the provider URL - only the Dispatcharr proxy URL by hash.
 */
function toVariants(origin, streams) {
    return (streams || [])
        .filter(s => s && s.stream_hash)
        .map(s => {
            const stats = s.stream_stats || {};
            const { width, height } = parseResolution(stats.resolution);
            return {
                hash: s.stream_hash,
                url: `${origin}/proxy/ts/stream/${s.stream_hash}`,
                name: s.name,
                codec: normalizeCodec(stats.video_codec),
                width,
                height,
            };
        });
}

async function api(baseUrl, apiKey, path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', ...(options.headers || {}) },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Dispatcharr API ${path} -> ${res.status}`);
    return res.json();
}

/**
 * @param {string} channelUrl - Dispatcharr channel URL (…/proxy/ts/stream/<uuid>)
 * @returns {Promise<Array|null>} ordered variants, or null when not applicable
 */
async function getVariants(channelUrl) {
    const { apiKey, baseUrl } = config();
    if (!apiKey) return null;

    const m = CHANNEL_URL_RE.exec(channelUrl || '');
    if (!m) return null;
    const [, origin, uuid] = m;

    // Only talk to the configured Dispatcharr - the key never goes elsewhere
    const apiBase = baseUrl || origin;
    if (baseUrl && new URL(baseUrl).origin !== new URL(origin).origin) return null;

    const hit = cache.get(uuid);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.variants;

    const channels = await api(apiBase, apiKey, '/api/channels/channels/by-uuids/', {
        method: 'POST',
        body: JSON.stringify({ uuids: [uuid] }),
    });
    const channel = Array.isArray(channels) ? channels[0] : null;
    if (!channel) return null;

    const detail = await api(apiBase, apiKey, `/api/channels/channels/${channel.id}/?include_streams=true`);
    const variants = toVariants(origin, detail.streams);
    cache.set(uuid, { at: Date.now(), variants });
    return variants;
}

module.exports = { getVariants, toVariants, normalizeCodec, parseResolution, _cache: cache };
