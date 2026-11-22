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
import type { PinterestPin, PinterestUser } from "../types.js";
import type { PinterestClient } from "../client.js";
/** Full pin from `PinResource/get` (v3_get_pin) — richer than feed pins. */
export interface PinDetail extends PinterestPin {
    repin_count?: number;
    share_count?: number;
    comment_count?: number;
    favorite_user_count?: number;
    is_video?: boolean;
    is_playable?: boolean;
    method?: string;
    media_attribution?: unknown;
    closeup_description?: string | null;
    alt_text?: string | null;
    story_pin_data?: unknown;
    aggregated_pin_data?: {
        id?: string;
        node_id?: string;
        comment_count?: number;
        aggregated_stats?: Record<string, unknown>;
        did_it_data?: Record<string, unknown>;
        is_shop_the_look?: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
/** One aggregated comment from `UnifiedCommentsResource/get`. */
export interface AggregatedComment {
    node_id: string;
    id: string;
    type: "aggregatedcomment";
    text: string;
    comment_count?: number;
    tagged_users?: unknown[];
    tags?: unknown[];
    is_edited?: boolean;
    reaction_by_me?: number;
    helpful_count?: number;
    created_at?: string;
    user?: Partial<PinterestUser>;
    highlighted_by_pin_owner?: boolean;
    reaction_counts?: Record<string, number>;
    marked_helpful_by_me?: boolean;
    [key: string]: unknown;
}
/** A module inside the related-modules feed. */
export interface RelatedModule {
    type?: "story" | "pin";
    story_type?: string;
    title?: {
        format?: string;
        args?: unknown[];
    };
    id?: string;
    node_id?: string;
    /** When type === "pin", the module IS a pin object. */
    images?: PinterestPin["images"];
    description?: string;
    grid_title?: string;
    pinner?: PinterestUser;
    objects?: unknown[];
    [key: string]: unknown;
}
export interface GetPinOptions {
    pinId: string;
    /** "auth_web_main_pin" (logged in) or "web_main_pin" (guest). */
    fieldSetKey?: string;
    addFields?: string;
    noCache?: boolean;
    fetchVisualSearchObjects?: boolean;
    getPageMetadata?: boolean;
}
export interface RelatedPinsOptions {
    pinId: string;
    contextPinIds?: string[];
    contextNearDupImageSigs?: string[];
    homefeedSourceSig?: boolean | null;
    pageSize?: number;
    searchQuery?: string;
    source?: "pin" | "feed_home" | string;
    topLevelSource?: string;
    topLevelSourceDepth?: number;
    isPdp?: boolean;
    additionalFields?: string[];
    clientTrackingParams?: string;
    bookmarks?: string[];
}
export interface GetCommentsOptions {
    /** The pin's `aggregated_pin_data.id` (== comment filter objectId). */
    aggregatedPinId: string;
    pageSize?: number;
    isReversed?: boolean;
    commentFeaturedIds?: string[];
}
export interface AddCommentOptions {
    pinId: string;
    /** The pin's `aggregated_pin_data.id`. */
    aggregatedPinId: string;
    text: string;
    tags?: string[];
    force?: boolean;
}
export declare class PinsResource {
    private readonly c;
    constructor(c: PinterestClient);
    /** Full closeup pin detail (`v3_get_pin`). */
    get(options: GetPinOptions): Promise<PinDetail>;
    /** "More to explore" feed under a pin (`v3_related_modules_for_pin`). */
    related(options: RelatedPinsOptions): Promise<{
        modules: RelatedModule[];
        pins: PinDetail[];
    }>;
    /** Comments on a pin (`v3_get_aggregated_pin_data_unified_comments`). */
    comments(options: GetCommentsOptions): Promise<{
        comments: AggregatedComment[];
        bookmark?: string | undefined;
    }>;
    /** Post a comment (`AggregatedCommentResource/create`). */
    addComment(options: AddCommentOptions): Promise<AggregatedComment>;
}
export type { PinterestPin, PinterestUser, };
