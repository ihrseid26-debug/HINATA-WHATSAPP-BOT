/**
 * PinterestClient — entry point for the unofficial Pinterest SDK.
 *
 * Wraps the captured wire formats:
 *  - `/resource/<Name>/<action>/` (v1 resource API)
 *  - `/_/graphql/` (GraphQL with `x-pinterest-graphql-name`)
 *  - `ApiResource` passthrough to `/v3/...` REST routes
 *
 * Usage:
 * ```ts
 * import { PinterestClient } from "pinterest-unofficial";
 *
 * const client = new PinterestClient();
 * const pins = await client.search.searchPins({ query: "anime" });
 * ```
 */
import { AuthResource } from "./resources/auth.js";
import { BoardsResource } from "./resources/boards.js";
import { FeedResource } from "./resources/feed.js";
import { PinsResource } from "./resources/pins.js";
import { SearchResource } from "./resources/search.js";
import { UserResourceImpl } from "./resources/users.js";
import { PinterestTransport, type PinterestTransportOptions } from "./transport.js";
import type { ResourceEnvelope } from "./types.js";
export declare class PinterestClient {
    readonly transport: PinterestTransport;
    readonly auth: AuthResource;
    readonly search: SearchResource;
    readonly boards: BoardsResource;
    readonly users: UserResourceImpl;
    readonly feed: FeedResource;
    readonly pins: PinsResource;
    constructor(options?: PinterestTransportOptions);
    /**
     * Bootstrap a guest session: fetching the homepage seeds the
     * `csrftoken` + `_pinterest_sess` cookies that every API call needs.
     * Called lazily before the first authenticated call if needed.
     */
    bootstrap(): Promise<void>;
    /** Current CSRF token (bootstrap first). */
    get csrfToken(): string | undefined;
    /** Whether the cookie jar marks the session as logged in (`_auth=1`). */
    get isAuthenticated(): boolean;
    /** Serialize cookies for persistence (restore with `restoreCookies`). */
    serializeCookies(): string;
    /** Restore a persisted session (cookie header string). */
    restoreCookies(header: string): void;
    /**
     * Low-level escape hatch: any resource endpoint by name/action, with
     * raw options. Everything else on this client funnels through here.
     */
    resource<TData = unknown>(init: {
        name: string;
        action: "get" | "create" | "update" | "delete";
        options: Record<string, unknown>;
        context?: Record<string, unknown>;
        sourceUrl?: string;
        method?: "GET" | "POST";
    }): Promise<ResourceEnvelope<TData>>;
    /**
     * Low-level GraphQL call: operation name + query hash + variables.
     * Hashes rotate; capture them from the browser when needed.
     */
    graphql<TData = unknown>(init: {
        operationName: string;
        queryHash: string;
        variables: Record<string, unknown>;
    }): Promise<{
        data: TData;
    }>;
    /**
     * GraphQL against the SSE streaming endpoint (`/_/graphql/stream/`,
     * operation e.g. `CloseupDetailQuery`). Returns every parsed frame.
     */
    graphqlStream<TData = unknown>(init: {
        operationName: string;
        queryHash: string;
        variables: Record<string, unknown>;
    }): Promise<Array<{
        data: TData;
    }>>;
}
export * from "./types.js";
export * from "./errors.js";
export { PinterestTransport, decodeDataParam, DEFAULT_UA, } from "./transport.js";
export type { PinterestTransportOptions, ResourceAction, ResourceCallInit, } from "./transport.js";
