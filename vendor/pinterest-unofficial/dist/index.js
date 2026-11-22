/**
 * pinterest-unofficial — unofficial Pinterest SDK.
 *
 * Reverse-engineered from live HTTP captures (HTTP Toolkit) of the
 * Pinterest web client. TypeScript, zero runtime dependencies (Node 18+
 * native fetch).
 */
export { PinterestClient } from "./client.js";
export * from "./types.js";
export * from "./errors.js";
export { PinterestTransport, decodeDataParam, parseEventStream, DEFAULT_UA, } from "./transport.js";
export { CookieJar } from "./cookies.js";
