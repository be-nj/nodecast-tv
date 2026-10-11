const express = require('express');
const router = express.Router();
const { getVariants } = require('../services/dispatcharrVariants');

/**
 * GET /api/variants?url=<channel stream url>
 * Returns { variants: [...] } - empty when the channel has no known variants
 * (not a Dispatcharr channel, no API key configured, or lookup failed).
 */
router.get('/', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    try {
        const variants = await getVariants(url);
        res.json({ variants: variants || [] });
    } catch (err) {
        console.warn('[Variants] Lookup failed:', err.message);
        res.json({ variants: [] });
    }
});

module.exports = router;
