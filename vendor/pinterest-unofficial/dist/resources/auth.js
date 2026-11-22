/**
 * Auth flow — login, SSO info, session management.
 *
 * Grounded in captures:
 *  - `POST /secure/sso_info/`            → SSO check by email
 *  - `POST /resource/UserSessionResource/create/` → v3_login_user
 *  - Login success sets `_auth=1`, `_pinterest_sess`, `l_o`, `__Secure-s_a`
 *    cookies; the browser then refreshes the page with those cookies.
 */
import { loginWithPuppeteer, } from "./login-puppeteer.js";
export class AuthResource {
    c;
    constructor(c) {
        this.c = c;
    }
    /** Check whether an email routes through SSO. */
    async ssoInfo(options) {
        const res = await this.c.transport.request("/secure/sso_info/", {
            method: "POST",
            body: JSON.stringify({ email: options.email }),
            bodyContentType: "application/json",
        });
        const parsed = JSON.parse(res.body);
        return parsed.data;
    }
    /**
     * Log in with email/username + password.
     *
     * Returns the user object; on success the transport's cookie jar
     * carries `_auth=1` + the session cookie, so subsequent calls are
     * authenticated. Without `arkoseSessionToken`/`recaptchaV3Token` the
     * server typically rejects the login with a challenge — fetch them by
     * solving the Arkose captcha on `https://id.pinterest.com/login/`.
     */
    async login(options) {
        const loginOptions = {
            username_or_email: options.usernameOrEmail,
            password: options.password,
            get_user: options.get_user ?? true,
            app_type_from_client: options.app_type_from_client ?? 5,
            visited_pages_before_login: options.visited_pages_before_login,
            ui_component: options.ui_component ?? "home_page.Login",
            handler: options.handler ?? "www/index.js",
        };
        if (options.arkoseSessionToken !== undefined) {
            loginOptions.arkoseSessionToken = options.arkoseSessionToken;
        }
        if (options.recaptchaV3Token !== undefined) {
            loginOptions.recaptchaV3Token = options.recaptchaV3Token;
        }
        const env = await this.c.transport.resource({
            name: "UserSessionResource",
            action: "create",
            options: loginOptions,
            sourceUrl: "/",
            method: "POST",
        });
        return env.resource_response.data.user;
    }
    /**
     * OPTIONAL: drive a real stealth-patched Chrome through the login form
     * (via `super-puppeteer`) and adopt the resulting session cookies into
     * the SDK.
     *
     * Unlike `login()`, this bypasses Arkose/reCAPTCHA challenges because a
     * genuine browser solves them invisibly — but it needs the optional deps:
     *     npm install super-puppeteer puppeteer
     * Without them, this throws a `PinterestError` pointing at the install
     * command, and `login()` still works for sessions that pass raw HTTP.
     */
    loginWithPuppeteer(options) {
        return loginWithPuppeteer(this.c, options);
    }
}
