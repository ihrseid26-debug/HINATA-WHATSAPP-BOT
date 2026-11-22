/**
 * Home feed + general `/v3/` REST proxy through the `ApiResource` wrapper.
 *
 * Grounded in captures:
 *  - GET `UserHomefeedResource/get/` — `{field_set_key: "hf_grid",
 *    in_nux, in_news_hub, static_feed, bookmarks}` → `v3_home_feed`
 *    (a plain array of pins).
 *  - GET/POST `ApiResource/get|create|update/` — generic passthrough to
 *    `/v3/...` REST routes (users/me, media/uploads, compliance, etc.).
 */
export class FeedResource {
    c;
    constructor(c) {
        this.c = c;
    }
    /** Logged-in home feed (`v3_home_feed`). Requires auth. */
    async homeFeed(options = {}) {
        const opts = {
            field_set_key: options.fieldSetKey ?? "hf_grid",
            in_nux: options.inNux ?? false,
            in_news_hub: options.inNewsHub ?? false,
            static_feed: options.staticFeed ?? false,
        };
        if (options.bookmarks !== undefined)
            opts.bookmarks = options.bookmarks;
        const env = await this.c.transport.resource({
            name: "UserHomefeedResource",
            action: "get",
            options: opts,
            sourceUrl: "/",
            forcePost: options.bookmarks !== undefined,
        });
        return {
            pins: env.resource_response.data,
            bookmark: env.resource_response.bookmark,
        };
    }
    /**
     * Generic `/v3/` REST call through the `ApiResource` wrapper.
     * Covers endpoints with no dedicated method (media uploads, drafts,
     * compliance requirements, ghost queries, ...).
     */
    async v3(options, action = "get") {
        const env = await this.c.transport.resource({
            name: "ApiResource",
            action,
            options: {
                url: options.url,
                data: options.data ?? {},
                ...("fields" in options ? { fields: options.fields } : {}),
            },
            sourceUrl: "/",
            method: action === "get" ? "GET" : "POST",
        });
        return env.resource_response.data;
    }
}
