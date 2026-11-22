/**
 * Pins — closeup detail, related modules, comments.
 *
 * Grounded in captures (pin closeup browsing, 2026-08-30):
 *  - GET `PinResource/get/`          → v3_get_pin (full closeup pin).
 *    Options: `{id, field_set_key: "auth_web_main_pin", add_fields,
 *    noCache, fetch_visual_search_objects, get_page_metadata}`.
 *  - GET `RelatedModulesResource/get/` → v3_related_modules_for_pin.
 *    Options: `{pin_id, context_pin_ids, context_near_dup_image_sigs,
 *    page_size, source, top_level_source, ..., bookmarks}`. Data is an
 *    array of modules; pin modules ARE complete pin objects.
 *  - GET `UnifiedCommentsResource/get/` → v3_get_aggregated_pin_data_unified_comments.
 *    Options: `{aggregated_pin_id, page_size, is_reversed, ...}`. Data is
 *    an array of aggregated comments.
 *  - POST `AggregatedCommentResource/create/` — post a comment.
 *    Options: `{force, objectId (=aggregated_pin_id), pinId, tags, text}`.
 */
export class PinsResource {
    c;
    constructor(c) {
        this.c = c;
    }
    /** Full closeup pin detail (`v3_get_pin`). */
    async get(options) {
        const env = await this.c.transport.resource({
            name: "PinResource",
            action: "get",
            options: {
                id: options.pinId,
                field_set_key: options.fieldSetKey ?? "auth_web_main_pin",
                add_fields: options.addFields ??
                    "pin.gen_ai_topics,pin.is_eligible_for_image_download,pin.is_eligible_for_ai_comparison,pin.has_hidden_inner_pin",
                noCache: options.noCache ?? true,
                fetch_visual_search_objects: options.fetchVisualSearchObjects ?? false,
                get_page_metadata: options.getPageMetadata ?? false,
            },
            sourceUrl: "/",
        });
        return env.resource_response.data;
    }
    /** "More to explore" feed under a pin (`v3_related_modules_for_pin`). */
    async related(options) {
        const opts = {
            additional_fields: options.additionalFields ?? ["pin.gen_ai_topics"],
            pin_id: options.pinId,
            context_pin_ids: options.contextPinIds ?? [],
            context_near_dup_image_sigs: options.contextNearDupImageSigs ?? [],
            homefeed_source_sig: options.homefeedSourceSig ?? null,
            page_size: options.pageSize ?? 12,
            search_query: options.searchQuery ?? "",
            source: options.source ?? "pin",
            top_level_source: options.topLevelSource ?? "feed_home",
            top_level_source_depth: options.topLevelSourceDepth ?? 3,
            is_pdp: options.isPdp ?? false,
        };
        if (options.clientTrackingParams !== undefined) {
            opts.client_tracking_params = options.clientTrackingParams;
        }
        if (options.bookmarks !== undefined)
            opts.bookmarks = options.bookmarks;
        const env = await this.c.transport.resource({
            name: "RelatedModulesResource",
            action: "get",
            options: opts,
            sourceUrl: `/pin/${options.pinId}/`,
            forcePost: options.bookmarks !== undefined,
        });
        const modules = env.resource_response.data;
        return {
            modules,
            pins: modules.filter((m) => m.type === "pin"),
        };
    }
    /** Comments on a pin (`v3_get_aggregated_pin_data_unified_comments`). */
    async comments(options) {
        const env = await this.c.transport.resource({
            name: "UnifiedCommentsResource",
            action: "get",
            options: {
                aggregated_pin_id: options.aggregatedPinId,
                comment_featured_ids: options.commentFeaturedIds ?? [],
                page_size: options.pageSize ?? 10,
                redux_normalize_feed: true,
                is_reversed: options.isReversed ?? false,
            },
            sourceUrl: "/",
        });
        return {
            comments: env.resource_response.data,
            bookmark: env.resource_response.bookmark,
        };
    }
    /** Post a comment (`AggregatedCommentResource/create`). */
    async addComment(options) {
        const env = await this.c.transport.resource({
            name: "AggregatedCommentResource",
            action: "create",
            options: {
                force: options.force ?? false,
                objectId: options.aggregatedPinId,
                pinId: options.pinId,
                tags: JSON.stringify(options.tags ?? []),
                text: options.text,
            },
            sourceUrl: `/pin/${options.pinId}/`,
            method: "POST",
        });
        return env.resource_response.data;
    }
}
