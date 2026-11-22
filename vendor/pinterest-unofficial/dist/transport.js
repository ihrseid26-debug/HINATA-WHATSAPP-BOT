/**
 * Low-level HTTP transport for the Pinterest web API.
 *
 * Implements the exact wire format observed in captures:
 *
 *  - Resource calls: `GET|POST /resource/<Name>/<action>/` with a
 *    `source_url` param and a `data` param carrying
 *    `JSON.stringify({ options, context })`, URL-encoded.
 *  - GraphQL: `POST /_/graphql/` with a JSON body
 *    `{ queryHash, variables }` and the `x-pinterest-graphql-name` header.
 *  - Auth: cookie jar + `x-csrftoken` mirroring the `csrftoken` cookie.
 */
import { CookieJar } from "./cookies.js";
import { PinterestAuthError, PinterestCsrfError, PinterestHttpError, PinterestResourceError, } from "./errors.js";
export const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
/** Decode a `data` param back to the payload (used by tests). */
export function decodeDataParam(encoded) {
    return JSON.parse(decodeURIComponent(encoded));
}
/**
 * Parse a `text/event-stream` body into its JSON payloads.
 *
 * SSE frame grammar (what/whatwg): lines of `field: value` separated by
 * blank lines. `data:` lines accumulate per event; we JSON.parse each
 * completed event's accumulated data. Non-JSON or comment lines (`:`)
 * are skipped.
 */
export function parseEventStream(body) {
    const frames = [];
    let dataLines = [];
    const flush = () => {
        if (dataLines.length === 0)
            return;
        const raw = dataLines.join("\n");
        dataLines = [];
        const trimmed = raw.trim();
        if (!trimmed)
            return;
        try {
            frames.push(JSON.parse(trimmed));
        }
        catch {
            // skip non-JSON frames (e.g. `: ping` comments handled below)
        }
    };
    for (const line of body.split(/\r?\n/)) {
        if (line === "") {
            flush();
            continue;
        }
        if (line.startsWith(":"))
            continue; // comment/keepalive
        const idx = line.indexOf(":");
        const field = idx === -1 ? line : line.slice(0, idx);
        let value = idx === -1 ? "" : line.slice(idx + 1);
        if (value.startsWith(" "))
            value = value.slice(1);
        if (field === "data")
            dataLines.push(value);
    }
    flush();
    return frames;
}
export class PinterestTransport {
    cookies = new CookieJar();
    options;
    constructor(options = {}) {
        this.options = {
            baseUrl: options.baseUrl ?? "https://id.pinterest.com",
            pwsHandler: options.pwsHandler ?? "www/index.js",
            appVersion: options.appVersion ?? "30c1eaf",
            referer: options.referer ?? "https://id.pinterest.com/",
            userAgent: options.userAgent ?? DEFAULT_UA,
            timeoutMs: options.timeoutMs ?? 30_000,
            fetchImpl: options.fetchImpl,
        };
    }
    /** Domain of the base URL (for cookie default-domain matching). */
    get host() {
        return new URL(this.options.baseUrl).hostname;
    }
    /** Parse and store cookies from a Set-Cookie list. */
    storeCookies(setCookie, host) {
        this.cookies.store(setCookie, host);
    }
    /** Serialize the jar to a Cookie header string (persistence). */
    cookieHeader() {
        return this.cookies.headerFor(this.host);
    }
    /** Replace the jar wholesale (restore a saved session). */
    restoreCookies(header) {
        this.cookies.reset();
        for (const pair of header.split(";")) {
            const eq = pair.indexOf("=");
            if (eq < 1)
                continue;
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            if (!name)
                continue;
            // Best-effort: store with base-domain matching; expiry unknown → session.
            this.cookies.store([`${name}=${value}; path=/; domain=.pinterest.com`], this.host);
        }
    }
    /** CSRF token value (cookie `csrftoken`). */
    get csrfToken() {
        return this.cookies.csrfToken;
    }
    /** Logged in per `_auth` cookie. */
    get isAuthenticated() {
        return this.cookies.isAuthenticated;
    }
    /** Core request — assembles headers, sends, checks status, stores cookies. */
    async request(path, init) {
        const { baseUrl, userAgent, fetchImpl, timeoutMs } = this.options;
        const url = `${baseUrl}${path}`;
        const headers = {
            "user-agent": userAgent,
            accept: "application/json, text/javascript, */*, q=0.01",
            "accept-language": "en-US,en;q=0.9",
            origin: baseUrl,
            referer: this.options.referer,
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            ...init.headers,
        };
        const cookie = this.cookieHeader();
        if (cookie)
            headers.cookie = cookie;
        if (init.body !== undefined) {
            headers["content-type"] =
                init.bodyContentType ?? "application/x-www-form-urlencoded";
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const requestInit = {
            method: init.method,
            headers,
            signal: controller.signal,
            redirect: "follow",
        };
        if (init.body !== undefined)
            requestInit.body = init.body;
        try {
            const res = await (fetchImpl ?? fetch)(url, requestInit);
            this.storeCookies(res.headers.getSetCookie?.() ?? res.headers.getSetCookie?.() ?? undefined, res.url ? new URL(res.url).hostname : this.host);
            const text = await res.text();
            if (!res.ok) {
                if (res.status === 403) {
                    throw new PinterestCsrfError(url, res.status, res.statusText, text);
                }
                if (res.status === 401 || res.status === 440) {
                    throw new PinterestAuthError(url, res.status, res.statusText, text);
                }
                throw new PinterestHttpError(url, res.status, res.statusText, text);
            }
            return { body: text, status: res.status, statusText: res.statusText, url: res.url };
        }
        catch (err) {
            if (err instanceof PinterestHttpError)
                throw err;
            throw new PinterestHttpError(url, 0, "network", "request failed", {
                cause: err,
            });
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Build the `data` param value for a resource call. */
    encodeData(payload) {
        return encodeURIComponent(JSON.stringify(payload));
    }
    /**
     * Call a v1 resource endpoint.
     *
     * GET variant: `?source_url=...&data=<json>&_=<cachebuster>`
     * POST variant: body `source_url=...&data=<json>` (form-urlencoded)
     */
    async resource(init) {
        const action = init.action;
        const payload = {
            options: init.options,
            context: init.context ?? {},
        };
        const data = this.encodeData(payload);
        const sourceUrl = init.sourceUrl ?? "/";
        const headers = {
            "x-requested-with": "XMLHttpRequest",
            "x-pinterest-source-url": sourceUrl,
            "x-pinterest-appstate": "active",
            "x-pinterest-pws-handler": this.options.pwsHandler,
            "x-app-version": this.options.appVersion,
            ...(this.csrfToken !== undefined
                ? { "x-csrftoken": this.csrfToken }
                : {}),
        };
        const path = `/resource/${init.name}/${action}/`;
        let response;
        if (init.method === "POST" || init.forcePost) {
            response = await this.request(path, {
                method: "POST",
                headers,
                body: `source_url=${encodeURIComponent(sourceUrl)}&data=${data}`,
                bodyContentType: "application/x-www-form-urlencoded",
            });
        }
        else {
            const sep = path.includes("?") ? "&" : "?";
            const cacheBuster = Date.now();
            response = await this.request(`${path}${sep}source_url=${encodeURIComponent(sourceUrl)}&data=${data}&_=${cacheBuster}`, { method: "GET", headers });
        }
        return this.parseResourceEnvelope(response.body, init.name);
    }
    /** Execute a GraphQL operation. */
    async graphql(operationName, queryHash, variables) {
        const headers = {
            "x-pinterest-graphql-name": operationName,
            "x-pinterest-source-url": "/",
            "x-pinterest-pws-handler": this.options.pwsHandler,
            "x-pinterest-appstate": "active",
            "x-requested-with": "XMLHttpRequest",
            ...(this.csrfToken !== undefined
                ? { "x-csrftoken": this.csrfToken }
                : {}),
        };
        const response = await this.request("/_/graphql/", {
            method: "POST",
            headers,
            body: JSON.stringify({ queryHash, variables }),
            bodyContentType: "application/json",
        });
        let parsed;
        try {
            parsed = JSON.parse(response.body);
        }
        catch (err) {
            throw new PinterestHttpError(response.url, response.status, response.statusText, "graphql response is not JSON", { cause: err });
        }
        return parsed;
    }
    /**
     * Execute a GraphQL operation against the SSE streaming endpoint
     * (`/_/graphql/stream/`, captured with `CloseupDetailQuery`).
     *
     * The response is `text/event-stream` — one `data: {json}` frame per
     * message — rather than a plain JSON body. This method waits for the
     * stream to finish and returns every parsed frame.
     */
    async graphqlStream(operationName, queryHash, variables) {
        const headers = {
            "x-pinterest-graphql-name": operationName,
            "x-pinterest-source-url": "/",
            "x-pinterest-pws-handler": this.options.pwsHandler,
            "x-pinterest-appstate": "active",
            "x-requested-with": "XMLHttpRequest",
            accept: "text/event-stream",
            ...(this.csrfToken !== undefined
                ? { "x-csrftoken": this.csrfToken }
                : {}),
        };
        const response = await this.request("/_/graphql/stream/", {
            method: "POST",
            headers,
            body: JSON.stringify({ queryHash, variables }),
            bodyContentType: "application/json",
        });
        return parseEventStream(response.body);
    }
    parseResourceEnvelope(raw, name) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (err) {
            throw new PinterestHttpError("http://internal", // parse failures have no URL
            0, "parse", `bad JSON from ${name}`, { cause: err });
        }
        const envelope = parsed;
        const rr = envelope?.resource_response;
        if (!rr) {
            throw new PinterestResourceError(`missing resource_response from ${name}`, parsed);
        }
        if (rr.status !== "success" || rr.code !== 0) {
            throw new PinterestResourceError(`${name} failed: ${rr.message ?? rr.status} (code ${rr.code})`, parsed, rr.endpoint_name, rr.code, rr.status);
        }
        return envelope;
    }
}
