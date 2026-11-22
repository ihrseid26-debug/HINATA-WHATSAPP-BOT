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
import { PinterestError } from "../errors.js";
/* eslint-disable max-len */
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
export const DEFAULT_LOGIN_SELECTORS = {
    email: [
        "#streamlined-login-email",
        "#email",
    ],
    password: [
        "#streamlined-login-password",
        "#password",
    ],
    submit: [
        'form[aria-label="login form"] button[type="submit"]',
        'button[type="submit"]',
    ],
};
/** Hint messages when a selector group cannot be located on the page. */
export const LOGIN_SELECTOR_FAILURE_HINTS = {
    email: "email field (#streamlined-login-email / #email)",
    password: "password field (#streamlined-login-password / #password)",
    submit: "submit button (button[type=submit])",
};
export const PINTEREST_LOGIN_URL = "https://id.pinterest.com/login/";
function missingDependencyHint() {
    return new PinterestError("super-puppeteer login requires optional deps. Install them:\n" +
        "  npm install super-puppeteer puppeteer\n" +
        "The raw HTTP login (client.auth.login) works without them.");
}
/**
 * Probe selector candidates in order, returning the first that resolves to
 * an element. Pinterest AB-tests form markup, so a fixed selector is
 * brittle; try the known variants and let the page decide.
 */
async function resolveSelector(page, candidates) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    for (const sel of list) {
        try {
            const el = await page.$(sel);
            if (el)
                return sel;
        }
        catch {
            // invalid selector syntax — try the next candidate
        }
    }
    return null;
}
/** Load super-puppeteer lazily; throws a clear error when not installed. */
export async function loadSuperPuppeteer() {
    try {
        return await loadSuperPuppeteerImpl();
    }
    catch {
        throw missingDependencyHint();
    }
}
let loadSuperPuppeteerImpl = () => import("super-puppeteer");
/**
 * Test seam: override the module loader (e.g. to simulate the optional
 * dependency being absent). Returns a function that restores the default.
 */
export function setSuperPuppeteerLoader(loader) {
    const prev = loadSuperPuppeteerImpl;
    loadSuperPuppeteerImpl = loader;
    return () => {
        loadSuperPuppeteerImpl = prev;
    };
}
/**
 * Drive a real browser through the Pinterest login form, then adopt its
 * session into the SDK.
 *
 * `cookieDomain` lets tests (and multi-region setups) point the session at
 * the same host the transport talks to. Defaults to the transport's host.
 */
export async function loginWithPuppeteer(client, options, cookieDomain) {
    const module = await loadSuperPuppeteer();
    const headless = options.headless ?? false;
    const { email, password, submit } = DEFAULT_LOGIN_SELECTORS;
    const timeoutMs = options.timeoutMs ?? 60_000;
    const launched = await module.launch({
        headless,
        // Prefer real Chrome when present — cleaner fingerprints than
        // Chrome-for-Testing.
        puppeteer: process.platform === "win32"
            ? { channel: "chrome" }
            : {},
        ...options.launch,
    });
    const { browser, page } = launched;
    try {
        await page.goto(PINTEREST_LOGIN_URL, {
            waitUntil: "networkidle2",
            timeout: timeoutMs,
        });
        // Resolve each field to the first candidate that actually exists on
        // the page — Pinterest AB-tests the streamlined/classic form DOM.
        const resolved = {
            email: await resolveSelector(page, options.selectors?.email ?? email),
            password: await resolveSelector(page, options.selectors?.password ?? password),
            submit: await resolveSelector(page, options.selectors?.submit ?? submit),
        };
        if (!resolved.email) {
            throw new PinterestError(`login failed: email field not found (tried ${LOGIN_SELECTOR_FAILURE_HINTS.email})`);
        }
        if (!resolved.password) {
            throw new PinterestError(`login failed: password field not found (tried ${LOGIN_SELECTOR_FAILURE_HINTS.password})`);
        }
        if (!resolved.submit) {
            throw new PinterestError(`login failed: submit button not found (tried ${LOGIN_SELECTOR_FAILURE_HINTS.submit})`);
        }
        await page.type(resolved.email, options.usernameOrEmail, { delay: 40 });
        await page.type(resolved.password, options.password, { delay: 40 });
        await page.click(resolved.submit);
        // Wait for the auth cookie to flip. The web app redirects to the home
        // feed on success; polling cookies is the least brittle signal.
        const deadline = Date.now() + timeoutMs;
        let authenticated = false;
        while (Date.now() < deadline) {
            const cookies = await page.cookies();
            if (cookies.some((c) => c.name === "_auth" && c.value === "1")) {
                authenticated = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        if (!authenticated) {
            throw new PinterestError("login did not reach _auth=1 within timeout — check credentials and " +
                "whether Pinterest served a captcha (arkose) in the browser window");
        }
        // Adopt the browser session: every cookie, targeted at the same domain
        // the transport talks to.
        const cookies = await page.cookies();
        const domain = cookieDomain ?? client.transport.host;
        const cookieHeader = cookies
            .map((c) => `${c.name}=${c.value}`)
            .join("; ");
        client.transport.restoreCookies(cookieHeader);
        // anchor _auth + friends at the exact host we call
        for (const c of cookies) {
            client.transport.cookies.store([`${c.name}=${c.value}; path=/; domain=${domain}`], domain);
        }
        return await client.users.me();
    }
    finally {
        await browser.close().catch(() => { });
    }
}
