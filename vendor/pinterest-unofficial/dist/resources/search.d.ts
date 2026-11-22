/**
 * Search — `BaseSearchResource/get` (v3_search_pins) + typeahead.
 *
 * Grounded in captures:
 *  - GET/POST `BaseSearchResource/get/` — first page via GET when the
 *    search page loads; subsequent pages POST with `bookmarks` from the
 *    previous `resource_response.bookmark`.
 *  - GET `AdvancedTypeaheadResource/get/` — search-box suggestions.
 */
import type { OneBarModule, PinterestPin, RankedGuide, SearchPinsData } from "../types.js";
import type { PinterestClient } from "../client.js";
export type SearchScope = "pins" | "boards" | "users" | "my_pins" | "pins_from" | "people";
/** Search feed options mirroring the captured body. */
export interface SearchPinsOptions {
    query: string;
    scope?: SearchScope;
    /** Pass the previous response's `bookmark` to fetch the next page. */
    bookmarks?: string[];
    pageSize?: number;
    /** `rs` = result source: "typed", "filter", "related_searches", ... */
    rs?: string;
    filters?: string | null;
    appliedProductFilters?: string;
    source_id?: string | null;
    source_module_id?: string | null;
    domains?: string[] | null;
    price_min?: number | null;
    price_max?: number | null;
    [key: string]: unknown;
}
export declare class SearchResource {
    private readonly c;
    constructor(c: PinterestClient);
    /**
     * Search pins (the `?q=...&rs=typed` page).
     *
     * Returns the parsed `v3_search_pins` data plus the pagination cursor
     * from the envelope's `resource_response.bookmark` (capture-verified).
     */
    searchPins(options: SearchPinsOptions): Promise<{
        data: SearchPinsData;
        bookmark?: string | undefined;
    }>;
    /** Search hooks — typed convenience over the same endpoint. */
    search(query: string, scope?: SearchScope, extra?: Omit<SearchPinsOptions, "query" | "scope">): Promise<{
        data: SearchPinsData;
        bookmark?: string | undefined;
    }>;
    /** Search-box autocomplete terms. */
    typeahead(term: string, options?: {
        pinScope?: "pins" | "boards" | "people";
        count?: number;
    }): Promise<PinterestTypeaheadResult>;
}
export interface PinterestTypeaheadResult {
    query: string;
    result_metadatas?: Array<Record<string, unknown>>;
    suggested_queries?: string[];
    suggested_users?: PinterestUserLite[];
    suggest_scopes?: string[];
    typeahead_queries?: string[];
    [key: string]: unknown;
}
interface PinterestUserLite {
    id?: string;
    username?: string;
    full_name?: string;
    image_medium_url?: string;
    [key: string]: unknown;
}
export type { OneBarModule, PinterestPin, RankedGuide };
