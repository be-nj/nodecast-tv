/**
 * Quick Connect client logic for the login page.
 *
 * Everything (UI + d-pad wiring) is injected at runtime so login.html only
 * needs two additional <script> tags - keeps upstream merges conflict-free.
 *
 * Two modes:
 *  - TV mode (default): a "Quick Connect" button below the SSO button starts
 *    a pairing session and shows code + QR, then polls until approved.
 *  - Approve mode (login.html?connect=CODE, opened by scanning the QR on a
 *    signed-in phone): shows an approve dialog instead of the login form.
 */
(function () {
    'use strict';

    var POLL_INTERVAL_MS = 2000;

    var loginBox = document.querySelector('.login-box');
    var loginForm = document.getElementById('login-form');
    var ssoBtn = document.getElementById('btn-sso-login');
    var ssoDivider = document.querySelector('.sso-divider');
    var subtitle = document.getElementById('login-subtitle');

    var params = new URLSearchParams(window.location.search);
    var approveCode = params.get('connect');

    if (approveCode) {
        renderApproveMode(approveCode.toUpperCase());
    } else {
        renderTvMode();
    }

    // ------------------------------------------------------------------ TV

    function renderTvMode() {
        var btn = document.createElement('button');
        btn.id = 'btn-quickconnect';
        btn.className = 'btn-login';
        btn.style.cssText = 'background: transparent; border: 1px solid var(--color-border); color: var(--color-text-primary); display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px;';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg> Quick Connect';
        loginBox.appendChild(btn);

        // Rewire the d-pad focus chain at runtime (login.html stays untouched)
        btn.dataset.arrowup = 'btn-sso-login';
        btn.dataset.arrowdown = 'username';
        if (ssoBtn) { ssoBtn.dataset.arrowdown = 'btn-quickconnect'; }
        var username = document.getElementById('username');
        if (username) { username.dataset.arrowup = 'btn-quickconnect'; }

        var panel = document.createElement('div');
        panel.id = 'quickconnect-panel';
        panel.style.cssText = 'display: none; text-align: center; margin-top: 16px; padding: 16px; background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md);';
        loginBox.appendChild(panel);

        var pollTimer = null;
        var logo = document.querySelector('.login-logo');
        var errorMessage = document.getElementById('error-message');
        var originalSubtitle = subtitle ? subtitle.textContent : '';

        btn.addEventListener('click', function () {
            btn.disabled = true;
            startSession();
        });

        // While pairing, hide everything except the panel so it always fits
        // the TV viewport - the centered login layout cannot scroll.
        function enterPairingUi() {
            if (loginForm) { loginForm.style.display = 'none'; }
            if (ssoDivider) { ssoDivider.style.display = 'none'; }
            if (ssoBtn) { ssoBtn.style.display = 'none'; }
            if (logo) { logo.style.display = 'none'; }
            btn.style.display = 'none';
        }

        function exitPairingUi() {
            if (loginForm) { loginForm.style.display = ''; }
            if (ssoDivider) { ssoDivider.style.display = ''; }
            if (ssoBtn) { ssoBtn.style.display = ''; }
            if (logo) { logo.style.display = ''; }
            btn.style.display = '';
            btn.disabled = false;
            if (subtitle) { subtitle.textContent = originalSubtitle; }
            panel.style.display = 'none';
            btn.focus();
        }

        function cancelPairing(message) {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            exitPairingUi();
            if (message && errorMessage) {
                errorMessage.textContent = message;
                errorMessage.classList.add('show');
            }
        }

        function startSession() {
            fetch('/api/auth/quickconnect/start', { method: 'POST' })
                .then(function (res) { return res.json(); })
                .then(function (session) {
                    if (!session.code) { throw new Error(session.error || 'Quick Connect unavailable'); }
                    showCode(session);
                    pollTimer = setInterval(function () { pollSession(session.secret); }, POLL_INTERVAL_MS);
                })
                .catch(function (err) {
                    cancelPairing(err.message);
                });
        }

        function showCode(session) {
            var url = window.location.origin + '/login.html?connect=' + session.code;
            enterPairingUi();
            panel.innerHTML =
                '<div style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 12px;">Scan with your phone (signed-in) and approve</div>' +
                '<div id="quickconnect-qr" style="display: inline-block; background: white; padding: 8px; border-radius: var(--radius-md);"></div>' +
                '<div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: var(--color-accent); margin-top: 10px;">' + session.code + '</div>' +
                '<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 6px;">Waiting for approval&hellip; (valid 5 minutes)</div>' +
                '<button id="btn-quickconnect-cancel" class="btn-login" style="margin-top: 12px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-primary);">Cancel</button>';
            panel.style.display = 'block';

            if (typeof qrcode === 'function') {
                var qr = qrcode(0, 'M');
                qr.addData(url);
                qr.make();
                document.getElementById('quickconnect-qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0 });
            }

            var cancelBtn = document.getElementById('btn-quickconnect-cancel');
            // d-pad: the cancel button is the only focusable element while pairing
            cancelBtn.dataset.arrowup = 'btn-quickconnect-cancel';
            cancelBtn.dataset.arrowdown = 'btn-quickconnect-cancel';
            cancelBtn.addEventListener('click', function () { cancelPairing(null); });
            cancelBtn.focus();
        }

        function pollSession(secret) {
            fetch('/api/auth/quickconnect/poll?secret=' + encodeURIComponent(secret))
                .then(function (res) { return res.json(); })
                .then(function (result) {
                    if (result.status === 'approved') {
                        clearInterval(pollTimer);
                        localStorage.setItem('authToken', result.token);
                        window.location.replace('/');
                    } else if (result.status === 'expired') {
                        cancelPairing('Quick Connect code expired - try again.');
                    }
                })
                .catch(function () { /* transient network error - keep polling */ });
        }
    }

    // ------------------------------------------------------------- approve

    function renderApproveMode(code) {
        var token = localStorage.getItem('authToken');

        var panel = document.createElement('div');
        panel.id = 'quickconnect-approve';
        panel.style.cssText = 'text-align: center; margin-top: 16px; padding: 16px; background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md);';

        if (!token) {
            // Not signed in on this device: keep the login form visible and
            // explain what to do.
            panel.innerHTML =
                '<div style="font-size: 14px; color: var(--color-text-primary);">TV sign-in request <b style="letter-spacing: 3px; color: var(--color-accent);">' + escapeHtml(code) + '</b></div>' +
                '<div style="font-size: 13px; color: var(--color-text-secondary); margin-top: 8px;">Sign in on this device first, then scan the QR code on the TV again (or reopen this link).</div>';
            loginBox.insertBefore(panel, loginForm);
            return;
        }

        if (subtitle) { subtitle.textContent = 'Approve TV sign-in'; }
        if (loginForm) { loginForm.style.display = 'none'; }
        if (ssoDivider) { ssoDivider.style.display = 'none'; }
        if (ssoBtn) { ssoBtn.style.display = 'none'; }

        panel.innerHTML =
            '<div style="font-size: 14px; color: var(--color-text-primary); margin-bottom: 4px;">A TV wants to sign in with code</div>' +
            '<div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: var(--color-accent); margin-bottom: 16px;">' + escapeHtml(code) + '</div>' +
            '<button id="btn-quickconnect-approve" class="btn-login">Approve</button>' +
            '<div id="quickconnect-approve-status" style="font-size: 13px; margin-top: 12px; color: var(--color-text-secondary);"></div>';
        loginBox.appendChild(panel);

        document.getElementById('btn-quickconnect-approve').addEventListener('click', function () {
            var status = document.getElementById('quickconnect-approve-status');
            fetch('/api/auth/quickconnect/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ code: code })
            })
                .then(function (res) {
                    if (res.status === 401) {
                        // stale token - show the login form again
                        localStorage.removeItem('authToken');
                        window.location.reload();
                        return null;
                    }
                    return res.json();
                })
                .then(function (result) {
                    if (!result) { return; }
                    if (result.success) {
                        panel.innerHTML = '<div style="font-size: 16px; color: var(--color-success, #10b981);">&#10003; TV signed in - you can close this page.</div>';
                    } else {
                        status.textContent = result.error || 'Approval failed';
                        status.style.color = 'var(--color-error)';
                    }
                })
                .catch(function (err) {
                    status.textContent = err.message;
                    status.style.color = 'var(--color-error)';
                });
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
})();
