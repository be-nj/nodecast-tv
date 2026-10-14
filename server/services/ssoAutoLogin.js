/**
 * Optional automatic SSO login (OIDC_AUTO_LOGIN=true): the login page
 * redirects straight to the identity provider instead of showing the form.
 *
 * The form stays for everything that needs it: an SSO error coming back,
 * Quick Connect approval links (?connect=), ?local while the provider is
 * down, and TV browsers, which pair with Quick Connect instead.
 */

const TV_AGENT = /\b(smart-?tv|tizen|web0s|webos|bravia|hbbtv|crkey|googletv|android tv|aft[a-z]+)\b/i;

function isEnabled(env) {
    const on = ['1', 'true', 'yes', 'on'].includes(String(env.OIDC_AUTO_LOGIN || '').toLowerCase());
    return on && Boolean(env.OIDC_ISSUER_URL && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET);
}

function shouldAutoLogin(query, userAgent, env = process.env) {
    if (!isEnabled(env)) return false;
    if (['error', 'connect', 'local'].some(key => key in (query || {}))) return false;
    return !TV_AGENT.test(userAgent || '');
}

/** Express middleware for the login page, mounted before the static files. */
function middleware(req, res, next) {
    if (shouldAutoLogin(req.query, req.get('user-agent'))) {
        return res.redirect('/api/auth/oidc/login');
    }
    next();
}

module.exports = { shouldAutoLogin, middleware };
