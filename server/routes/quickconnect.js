const express = require('express');
const router = express.Router();
const auth = require('../auth');
const quickconnect = require('../quickconnect');

/**
 * Quick Connect routes - kept in their own router (mounted under
 * /api/auth/quickconnect) so routes/auth.js stays untouched and
 * upstream merges stay conflict-free.
 */

/**
 * Start a pairing session (called by the TV, unauthenticated)
 * POST /api/auth/quickconnect/start
 */
router.post('/start', (req, res) => {
    const session = quickconnect.start();
    if (!session) {
        return res.status(429).json({ error: 'Too many pending Quick Connect requests, try again later' });
    }
    res.json(session);
});

/**
 * Poll a pairing session (called by the TV, unauthenticated)
 * GET /api/auth/quickconnect/poll?secret=...
 */
router.get('/poll', (req, res) => {
    const { secret } = req.query;
    if (!secret) {
        return res.status(400).json({ error: 'Missing secret' });
    }
    res.json(quickconnect.poll(secret));
});

/**
 * Approve a pairing code (called from a signed-in device)
 * POST /api/auth/quickconnect/approve  { code }
 */
router.post('/approve', auth.requireAuth, (req, res) => {
    const { code } = req.body || {};
    if (!code) {
        return res.status(400).json({ error: 'Missing code' });
    }

    const token = auth.generateToken(req.user);
    if (!quickconnect.approve(code, token)) {
        return res.status(404).json({ error: 'Unknown, expired or already approved code' });
    }
    res.json({ success: true });
});

module.exports = router;
