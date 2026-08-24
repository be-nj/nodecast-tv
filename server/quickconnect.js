const crypto = require('crypto');

/**
 * Quick Connect - Jellyfin-style TV pairing
 *
 * A device that cannot comfortably enter credentials (TV) requests a short
 * code. A user who is already signed in on another device (phone/desktop)
 * approves the code, which hands the TV a JWT.
 *
 * Sessions are kept in memory only - a restart simply invalidates pending
 * codes, which is fine for a 5 minute pairing window.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 100;
// No ambiguous characters (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// code -> { secret, createdAt, token }
const sessions = new Map();

function prune() {
    const now = Date.now();
    for (const [code, session] of sessions) {
        if (now - session.createdAt > CODE_TTL_MS) {
            sessions.delete(code);
        }
    }
}

function generateCode() {
    return Array.from(crypto.randomBytes(6))
        .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
        .join('');
}

/**
 * Create a new pairing session.
 * Returns { code, secret } or null when too many sessions are pending.
 */
function start() {
    prune();
    if (sessions.size >= MAX_PENDING) {
        return null;
    }

    let code;
    do {
        code = generateCode();
    } while (sessions.has(code));

    const secret = crypto.randomBytes(32).toString('hex');
    sessions.set(code, { secret, createdAt: Date.now(), token: null });
    return { code, secret };
}

/**
 * Attach a token to a pending code (called by an authenticated user).
 * Returns true when the code existed and was still unapproved.
 */
function approve(code, token) {
    prune();
    const session = sessions.get(String(code || '').toUpperCase());
    if (!session || session.token) {
        return false;
    }
    session.token = token;
    return true;
}

/**
 * Poll a pairing session by its secret.
 * Returns { status: 'pending' } | { status: 'approved', token } | { status: 'expired' }.
 * An approved session is consumed by the successful poll.
 */
function poll(secret) {
    prune();
    const provided = Buffer.from(String(secret || ''));
    for (const [code, session] of sessions) {
        const expected = Buffer.from(session.secret);
        if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
            if (session.token) {
                sessions.delete(code);
                return { status: 'approved', token: session.token };
            }
            return { status: 'pending' };
        }
    }
    return { status: 'expired' };
}

module.exports = { start, approve, poll };
