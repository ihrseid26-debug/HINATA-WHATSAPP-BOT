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
import type { GraphqlEnvelope, ResourceEnvelope } from "./types.js";
export declare const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
/** A full HTTP client configuration. */
export interface PinterestTransportOptions {
    /** Base origin. Region-specific domains (`id.`, `www.`) both work. */
    baseUrl?: string;
    /** Page handler sent as `x-pinterest-pws-handler`. */
    pwsHandler?: string;
    /** App version sent as `x-app-version`. */
    appVersion?: string;
    /** Referer/Origin header sent on same-origin calls. */
    referer?: string;
    userAgent?: string;
    /** fetch-like function; default global fetch. */
    fetchImpl?: typeof fetch;
    /** Request timeout in ms. */
    timeoutMs?: number;
}
export type ResourceAction = "get" | "create" | "update" | "delete";
export interface ResourceCallInit {
    name: string;
    action: ResourceAction;
    options: Record<string, unknown>;
    context?: Record<string, unknown>;
    /** `x-pinterest-source-url` + `source_url` param (path only). */
    sourceUrl?: string;
    /** Use POST instead of GET. GET is the default for reads. */
    method?: "GET" | "POST";
    /** Force sending a body even for GET-ish actions (BaseSearchResource POST variant). */
    forcePost?: boolean;
}
/** Decode a `data` param back to the payload (used by tests). */
export declare function decodeDataParam(encoded: string): {
    options: Record<string, unknown>;
    context: Record<string, unknown>;
};
/**
 * Parse a `text/event-stream` body into its JSON payloads.
 *
 * SSE frame grammar (what/whatwg): lines of `field: value` separated by
 * blank lines. `data:` lines accumulate per event; we JSON.parse each
 * completed event's accumulated data. Non-JSON or comment lines (`:`)
 * are skipped.
 */
export declare function parseEventStream<TData = unknown>(body: string): GraphqlEnvelope<TData>[];
export declare class PinterestTransport {
    readonly cookies: CookieJar;
    readonly options: Required<Omit<PinterestTransportOptions, "fetchImpl">> & {
        fetchImpl: typeof fetch | undefined;
    };
    constructor(options?: PinterestTransportOptions);
    /** Domain of the base URL (for cookie default-domain matching). */
    get host(): string;
    /** Parse and store cookies from a Set-Cookie list. */
    storeCookies(setCookie: string[] | undefined, host: string): void;
    /** Serialize the jar to a Cookie header string (persistence). */
    cookieHeader(): string;
    /** Replace the jar wholesale (restore a saved session). */
    restoreCookies(header: string): void;
    /** CSRF token value (cookie `csrftoken`). */
    get csrfToken(): string | undefined;
    /** Logged in per `_auth` cookie. */
    get isAuthenticated(): boolean;
    /** Core request — assembles headers, sends, checks status, stores cookies. */
    request(path: string, init: {
        method: string;
        headers?: Record<string, string>;
        body?: string;
        bodyContentType?: string;
    }): Promise<{
        body: string;
        status: number;
        statusText: string;
        url: string;
    }>;
    /** Build the `data` param value for a resource call. */
    private encodeData;
    /**
     * Call a v1 resource endpoint.
     *
     * GET variant: `?source_url=...&data=<json>&_=<cachebuster>`
     * POST variant: body `source_url=...&data=<json>` (form-urlencoded)
     */
    resource<TData = unknown>(init: ResourceCallInit): Promise<ResourceEnvelope<TData>>;
    /** Execute a GraphQL operation. */
    graphql<TData = unknown>(operationName: string, queryHash: string, variables: Record<string, unknown>): Promise<GraphqlEnvelope<TData>>;
    /**
     * Execute a GraphQL operation against the SSE streaming endpoint
     * (`/_/graphql/stream/`, captured with `CloseupDetailQuery`).
     *
     * The response is `text/event-stream` — one `data: {json}` frame per
     * message — rather than a plain JSON body. This method waits for the
     * stream to finish and returns every parsed frame.
     */
    graphqlStream<TData = unknown>(operationName: string, queryHash: string, variables: Record<string, unknown>): Promise<GraphqlEnvelope<TData>[]>;
    private parseResourceEnvelope;
}
