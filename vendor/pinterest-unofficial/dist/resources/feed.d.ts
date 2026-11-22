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
import type { PinterestPin } from "../types.js";
import type { PinterestClient } from "../client.js";
export interface HomeFeedOptions {
    /** Cursor from the previous response — the feed is paginated. */
    bookmarks?: string[];
    fieldSetKey?: string;
    inNux?: boolean;
    inNewsHub?: boolean;
    staticFeed?: boolean;
}
export interface ApiResourceOptions {
    url: string;
    data?: Record<string, unknown>;
    fields?: string[];
    [key: string]: unknown;
}
export declare class FeedResource {
    private readonly c;
    constructor(c: PinterestClient);
    /** Logged-in home feed (`v3_home_feed`). Requires auth. */
    homeFeed(options?: HomeFeedOptions): Promise<{
        pins: PinterestPin[];
        bookmark?: string | undefined;
    }>;
    /**
     * Generic `/v3/` REST call through the `ApiResource` wrapper.
     * Covers endpoints with no dedicated method (media uploads, drafts,
     * compliance requirements, ghost queries, ...).
     */
    v3<TData = unknown>(options: ApiResourceOptions, action?: "get" | "create" | "update"): Promise<TData>;
}
