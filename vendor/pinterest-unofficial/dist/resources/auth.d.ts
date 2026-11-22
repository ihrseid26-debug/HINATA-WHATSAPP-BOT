/**
 * Auth flow — login, SSO info, session management.
 *
 * Grounded in captures:
 *  - `POST /secure/sso_info/`            → SSO check by email
 *  - `POST /resource/UserSessionResource/create/` → v3_login_user
 *  - Login success sets `_auth=1`, `_pinterest_sess`, `l_o`, `__Secure-s_a`
 *    cookies; the browser then refreshes the page with those cookies.
 */
import type { PinterestUser, SsoInfoData } from "../types.js";
import type { PinterestClient } from "../client.js";
import { type PuppeteerLoginOptions } from "./login-puppeteer.js";
export type { PuppeteerLoginOptions } from "./login-puppeteer.js";
/** Parameters for `POST /secure/sso_info/`. */
export interface SsoInfoOptions {
    email: string;
}
/**
 * Options for the login mutation. `arkoseSessionToken` and
 * `recaptchaV3Token` are anti-bot challenge tokens the page collects
 * before submitting the login form — required in the wild.
 */
export interface LoginOptions {
    usernameOrEmail: string;
    password: string;
    get_user?: boolean;
    app_type_from_client?: number;
    visited_pages_before_login?: string;
    arkoseSessionToken?: string;
    recaptchaV3Token?: string;
    ui_component?: string;
    handler?: string;
}
export declare class AuthResource {
    private readonly c;
    constructor(c: PinterestClient);
    /** Check whether an email routes through SSO. */
    ssoInfo(options: SsoInfoOptions): Promise<SsoInfoData>;
    /**
     * Log in with email/username + password.
     *
     * Returns the user object; on success the transport's cookie jar
     * carries `_auth=1` + the session cookie, so subsequent calls are
     * authenticated. Without `arkoseSessionToken`/`recaptchaV3Token` the
     * server typically rejects the login with a challenge — fetch them by
     * solving the Arkose captcha on `https://id.pinterest.com/login/`.
     */
    login(options: LoginOptions): Promise<PinterestUser>;
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
    loginWithPuppeteer(options: PuppeteerLoginOptions): Promise<PinterestUser>;
}
/** HTTP Toolkit interceptor state (unused type placeholder for docs). */
export type LoginOutcome = {
    user: PinterestUser;
    authenticated: boolean;
};
