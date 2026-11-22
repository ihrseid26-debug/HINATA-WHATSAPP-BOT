/**
 * Minimal RFC 6265 cookie jar.
 *
 * Only what the Pinterest flow needs: parse `Set-Cookie`, render the
 * `Cookie` request header, and expose the `csrftoken` value used as
 * `x-csrftoken`. HttpOnly is fine — we never need to read session cookies
 * from script context, only echo them back.
 */
export interface StoredCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number | null;
    secure: boolean;
    httpOnly: boolean;
}
/** Parse one Set-Cookie header value. */
export declare function parseSetCookie(header: string, defaultDomain: string): StoredCookie | null;
export declare class CookieJar {
    private cookies;
    /** Store cookies from a Set-Cookie header list (may be undefined on some runtimes). */
    store(setCookie: string[] | undefined, responseHost: string): void;
    /** Replace the whole jar (e.g. restoring a persisted login). */
    reset(): void;
    /** Render the `Cookie` header for a request host. */
    headerFor(host: string): string;
    /** Read a cookie value by name (first match). */
    get(name: string): string | undefined;
    /** The CSRF token cookie — sent as `x-csrftoken` on every POST. */
    get csrfToken(): string | undefined;
    /** Whether `_auth=1` is present (logged-in session cookie from login flow). */
    get isAuthenticated(): boolean;
    /** All cookies as a serialized header string (for persistence). */
    serialize(): string;
    private hosts;
}
