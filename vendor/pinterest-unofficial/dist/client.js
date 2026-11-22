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
import { PinterestTransport } from "./transport.js";
export class PinterestClient {
    transport;
    auth;
    search;
    boards;
    users;
    feed;
    pins;
    constructor(options = {}) {
        this.transport = new PinterestTransport(options);
        this.auth = new AuthResource(this);
        this.search = new SearchResource(this);
        this.boards = new BoardsResource(this);
        this.users = new UserResourceImpl(this);
        this.feed = new FeedResource(this);
        this.pins = new PinsResource(this);
    }
    /**
     * Bootstrap a guest session: fetching the homepage seeds the
     * `csrftoken` + `_pinterest_sess` cookies that every API call needs.
     * Called lazily before the first authenticated call if needed.
     */
    async bootstrap() {
        if (this.transport.csrfToken !== undefined)
            return;
        await this.transport.request("/", { method: "GET" });
        if (this.transport.csrfToken === undefined) {
            throw new Error("bootstrap failed: server did not set csrftoken cookie");
        }
    }
    /** Current CSRF token (bootstrap first). */
    get csrfToken() {
        return this.transport.csrfToken;
    }
    /** Whether the cookie jar marks the session as logged in (`_auth=1`). */
    get isAuthenticated() {
        return this.transport.isAuthenticated;
    }
    /** Serialize cookies for persistence (restore with `restoreCookies`). */
    serializeCookies() {
        return this.transport.cookieHeader();
    }
    /** Restore a persisted session (cookie header string). */
    restoreCookies(header) {
        this.transport.restoreCookies(header);
    }
    /**
     * Low-level escape hatch: any resource endpoint by name/action, with
     * raw options. Everything else on this client funnels through here.
     */
    resource(init) {
        return this.transport.resource(init);
    }
    /**
     * Low-level GraphQL call: operation name + query hash + variables.
     * Hashes rotate; capture them from the browser when needed.
     */
    graphql(init) {
        return this.transport.graphql(init.operationName, init.queryHash, init.variables);
    }
    /**
     * GraphQL against the SSE streaming endpoint (`/_/graphql/stream/`,
     * operation e.g. `CloseupDetailQuery`). Returns every parsed frame.
     */
    graphqlStream(init) {
        return this.transport.graphqlStream(init.operationName, init.queryHash, init.variables);
    }
}
export * from "./types.js";
export * from "./errors.js";
export { PinterestTransport, decodeDataParam, DEFAULT_UA, } from "./transport.js";
