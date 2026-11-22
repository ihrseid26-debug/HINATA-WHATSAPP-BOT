/**
 * Puppeteer-backed login — OPTIONAL.
 *
 * The plain HTTP `AuthResource.login()` path hits Pinterest's bot checks
 * (Arkose/reCAPTCHA) that the raw API cannot solve. This module drives a
 * real stealth-patched Chrome via `super-puppeteer` (puppeteer + hand-rolled
 * evasions), logs in through the actual web form, then hands the session
 * cookies to the SDK transport so every subsequent SDK call is
 * authenticated.
 *
 * Both `super-puppeteer` and `puppeteer` are OPTIONAL peer dependencies:
 * they are only imported when this module is used. Users who prefer the raw
 * HTTP login never install them. See README "Auth" for the tradeoff.
 */
import type { PinterestUser } from "../types.js";
import type { PinterestClient } from "../client.js";
/**
 * Login-page selectors, grounded in live DOM captures of
 * `https://id.pinterest.com/login/`. Pinterest AB-tests two form layouts:
 *
 * Streamlined variant (current, observed 2026-08-30):
 *  - `<form aria-label="login form">`
 *  - `<input id="streamlined-login-email" type="email" autocomplete="email">`
 *  - `<input id="streamlined-login-password" type="password" autocomplete="current-password">`
 *  - `<button type="submit" aria-label="Log in">`
 *
 * Classic variant (observed on the initial capture):
 *  - `<input id="email" type="email" autocomplete="email">`
 *  - `<input id="password" type="password" autocomplete="current-password">`
 *  - `<button type="submit">Log in</button>`
 *
 * The SDK tries candidates in order and uses the first that matches.
 */
export declare const DEFAULT_LOGIN_SELECTORS: {
    readonly email: readonly ["#streamlined-login-email", "#email"];
    readonly password: readonly ["#streamlined-login-password", "#password"];
    readonly submit: readonly ["form[aria-label=\"login form\"] button[type=\"submit\"]", "button[type=\"submit\"]"];
};
/** Hint messages when a selector group cannot be located on the page. */
export declare const LOGIN_SELECTOR_FAILURE_HINTS: {
    readonly email: "email field (#streamlined-login-email / #email)";
    readonly password: "password field (#streamlined-login-password / #password)";
    readonly submit: "submit button (button[type=submit])";
};
export declare const PINTEREST_LOGIN_URL = "https://id.pinterest.com/login/";
export interface PuppeteerLoginOptions {
    usernameOrEmail: string;
    password: string;
    /** Windowed vs headless — `headless: false` (default) is far more
     * resistant to bot checks. */
    headless?: boolean;
    /** Selector overrides if Pinterest renames the form. Accepts a single
     * selector string or an array of candidates tried in order. */
    selectors?: {
        email?: string | readonly string[];
        password?: string | readonly string[];
        submit?: string | readonly string[];
    };
    /** Max ms to wait for `_auth=1` after submitting. */
    timeoutMs?: number;
    /** Extra options forwarded to super-puppeteer's `launch()`. */
    launch?: Record<string, unknown>;
}
/** Super-puppeteer's launch returns `{ browser, page }`. */
interface SuperPuppeteerModule {
    launch(opts?: Record<string, unknown>): Promise<{
        browser: {
            close(): Promise<void>;
        };
        page: {
            goto(url: string, opts?: {
                waitUntil?: string;
                timeout?: number;
            }): Promise<unknown>;
            /** Resolves to an element handle or null when the selector matches nothing. */
            $(selector: string): Promise<unknown | null>;
            type(selector: string, value: string, opts?: {
                delay?: number;
            }): Promise<void>;
            click(selector: string): Promise<void>;
            cookies(): Promise<Array<{
                name: string;
                value: string;
            }>>;
            waitForSelector(selector: string, opts?: {
                timeout?: number;
            }): Promise<unknown>;
        };
    }>;
}
/** Load super-puppeteer lazily; throws a clear error when not installed. */
export declare function loadSuperPuppeteer(): Promise<SuperPuppeteerModule>;
/**
 * Test seam: override the module loader (e.g. to simulate the optional
 * dependency being absent). Returns a function that restores the default.
 */
export declare function setSuperPuppeteerLoader(loader: () => Promise<SuperPuppeteerModule>): () => void;
/**
 * Drive a real browser through the Pinterest login form, then adopt its
 * session into the SDK.
 *
 * `cookieDomain` lets tests (and multi-region setups) point the session at
 * the same host the transport talks to. Defaults to the transport's host.
 */
export declare function loginWithPuppeteer(client: PinterestClient, options: PuppeteerLoginOptions, cookieDomain?: string): Promise<PinterestUser>;
export {};
