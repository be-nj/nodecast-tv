const test = require('node:test');
const assert = require('node:assert');
const { shouldAutoLogin } = require('../server/services/ssoAutoLogin');

const ON = {
    OIDC_AUTO_LOGIN: 'true',
    OIDC_ISSUER_URL: 'https://idp.example/',
    OIDC_CLIENT_ID: 'nodecast',
    OIDC_CLIENT_SECRET: 'secret',
};
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

test('desktop browsers go straight to the identity provider', () => {
    assert.strictEqual(shouldAutoLogin({}, DESKTOP, ON), true);
});

test('off unless asked for and SSO is configured', () => {
    assert.strictEqual(shouldAutoLogin({}, DESKTOP, { ...ON, OIDC_AUTO_LOGIN: '' }), false);
    assert.strictEqual(shouldAutoLogin({}, DESKTOP, { ...ON, OIDC_CLIENT_SECRET: '' }), false);
});

test('errors, Quick Connect approvals and ?local keep the form', () => {
    for (const query of [{ error: 'SSO Failed' }, { connect: 'ABCD' }, { local: '' }]) {
        assert.strictEqual(shouldAutoLogin(query, DESKTOP, ON), false);
    }
});

test('TV browsers keep the form for Quick Connect', () => {
    for (const agent of [
        'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2) AppleWebKit/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36',
        'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36',
    ]) {
        assert.strictEqual(shouldAutoLogin({}, agent, ON), false, agent);
    }
});
