/**
 * Minimal RFC 6265 cookie jar.
 *
 * Only what the Pinterest flow needs: parse `Set-Cookie`, render the
 * `Cookie` request header, and expose the `csrftoken` value used as
 * `x-csrftoken`. HttpOnly is fine — we never need to read session cookies
 * from script context, only echo them back.
 */
const HOST_ONLY_DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i;
/** Parse one Set-Cookie header value. */
export function parseSetCookie(header, defaultDomain) {
    const parts = header.split(";");
    const first = parts.shift();
    if (!first)
        return null;
    const eq = first.indexOf("=");
    if (eq < 1)
        return null;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name)
        return null;
    let domain = defaultDomain;
    let path = "/";
    let expires = null;
    let secure = false;
    let httpOnly = false;
    let maxAge = null;
    for (const raw of parts) {
        const part = raw.trim();
        if (!part)
            continue;
        const [k, ...rest] = part.split("=");
        const key = k ? k.trim().toLowerCase() : "";
        const val = rest.join("=").trim();
        switch (key) {
            case "domain": {
                const d = val.replace(/^\./, "");
                if (HOST_ONLY_DOMAIN_RE.test(d))
                    domain = d;
                break;
            }
            case "path":
                if (val.startsWith("/"))
                    path = val;
                break;
            case "expires": {
                const t = Date.parse(val);
                if (!Number.isNaN(t))
                    expires = t;
                break;
            }
            case "max-age": {
                const n = Number.parseInt(val, 10);
                if (!Number.isNaN(n))
                    maxAge = n;
                break;
            }
            case "secure":
                secure = true;
                break;
            case "httponly":
                httpOnly = true;
                break;
        }
    }
    if (maxAge !== null) {
        expires = maxAge <= 0 ? 0 : Date.now() + maxAge * 1000;
    }
    return { name, value, domain, path, expires, secure, httpOnly };
}
/** Domain-match a cookie against a request host (RFC 6265 §5.1.3 simplified). */
function domainMatches(cookieDomain, host) {
    if (cookieDomain === host)
        return true;
    return (host.length > cookieDomain.length &&
        host.endsWith(cookieDomain) &&
        host[host.length - cookieDomain.length - 1] === ".");
}
export class CookieJar {
    cookies = new Map();
    /** Store cookies from a Set-Cookie header list (may be undefined on some runtimes). */
    store(setCookie, responseHost) {
        if (!setCookie)
            return;
        for (const h of setCookie) {
            const c = parseSetCookie(h, responseHost);
            if (!c)
                continue;
            // Delete-on-expire
            if (c.expires !== null && c.expires <= Date.now()) {
                this.cookies.delete(`${c.name}\0${c.domain}\0${c.path}`);
                continue;
            }
            this.cookies.set(`${c.name}\0${c.domain}\0${c.path}`, c);
        }
    }
    /** Replace the whole jar (e.g. restoring a persisted login). */
    reset() {
        this.cookies.clear();
    }
    /** Render the `Cookie` header for a request host. */
    headerFor(host) {
        const now = Date.now();
        const parts = [];
        for (const c of this.cookies.values()) {
            if (c.expires !== null && c.expires <= now)
                continue;
            if (!domainMatches(c.domain, host))
                continue;
            parts.push(`${c.name}=${c.value}`);
        }
        return parts.join("; ");
    }
    /** Read a cookie value by name (first match). */
    get(name) {
        for (const c of this.cookies.values()) {
            if (c.name === name)
                return c.value;
        }
        return undefined;
    }
    /** The CSRF token cookie — sent as `x-csrftoken` on every POST. */
    get csrfToken() {
        return this.get("csrftoken");
    }
    /** Whether `_auth=1` is present (logged-in session cookie from login flow). */
    get isAuthenticated() {
        return this.get("_auth") === "1";
    }
    /** All cookies as a serialized header string (for persistence). */
    serialize() {
        return this.headerFor(this.hosts()[0] ?? "*");
    }
    hosts() {
        const s = new Set();
        for (const c of this.cookies.values())
            s.add(c.domain);
        return [...s];
    }
}
