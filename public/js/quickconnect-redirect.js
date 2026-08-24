/**
 * Quick Connect helper for the app page (index.html).
 *
 * When someone scans a TV pairing QR code while not signed in, the login
 * page stores the pending code and sends them through the normal login
 * (local or OIDC), which always lands on "/". This script bounces them
 * back to the approve dialog once they arrive signed in.
 *
 * Lives in its own file (one additive script tag in index.html) to keep
 * upstream merges conflict-free.
 */
(function () {
    'use strict';
    try {
        var raw = localStorage.getItem('quickconnectPending');
        if (!raw) { return; }

        var pending = JSON.parse(raw);
        // Codes expire server-side after 5 minutes - don't bounce for stale ones
        if (!pending.code || !pending.ts || Date.now() - pending.ts > 5 * 60 * 1000) {
            localStorage.removeItem('quickconnectPending');
            return;
        }

        if (localStorage.getItem('authToken')) {
            localStorage.removeItem('quickconnectPending');
            window.location.replace('/login.html?connect=' + encodeURIComponent(pending.code));
        }
    } catch (e) { /* never break the app over a pairing convenience */ }
})();
