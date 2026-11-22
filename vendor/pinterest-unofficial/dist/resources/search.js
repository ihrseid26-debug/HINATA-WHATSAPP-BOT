/**
 * Search — `BaseSearchResource/get` (v3_search_pins) + typeahead.
 *
 * Grounded in captures:
 *  - GET/POST `BaseSearchResource/get/` — first page via GET when the
 *    search page loads; subsequent pages POST with `bookmarks` from the
 *    previous `resource_response.bookmark`.
 *  - GET `AdvancedTypeaheadResource/get/` — search-box suggestions.
 */
export class SearchResource {
    c;
    constructor(c) {
        this.c = c;
    }
    /**
     * Search pins (the `?q=...&rs=typed` page).
     *
     * Returns the parsed `v3_search_pins` data plus the pagination cursor
     * from the envelope's `resource_response.bookmark` (capture-verified).
     */
    async searchPins(options) {
        const opts = {
            query: options.query,
            scope: options.scope ?? "pins",
            appliedProductFilters: options.appliedProductFilters ?? "---",
            domains: options.domains ?? null,
            user: null,
            seoDrawerEnabled: false,
            applied_unified_filters: null,
            auto_correction_disabled: false,
            filter_genai: false,
            journey_depth: null,
            source_id: null,
            source_module_id: null,
            static_feed: false,
            selected_one_bar_modules: null,
            query_pin_sigs: null,
            page_size: options.pageSize ?? null,
            gated: null,
            price_max: options.price_max ?? null,
            price_min: options.price_min ?? null,
            query_image_pins: null,
            request_params: null,
            top_pin_ids: null,
            article: null,
            corpus: null,
            filters: options.filters ?? null,
            rs: options.rs ?? "typed",
        };
        if (options.bookmarks !== undefined)
            opts.bookmarks = options.bookmarks;
        const sourceUrl = `/search/pins/?q=${encodeURIComponent(options.query)}&rs=${opts.rs}`;
        const env = await this.c.transport.resource({
            name: "BaseSearchResource",
            action: "get",
            options: opts,
            sourceUrl,
            // Follow the captured behavior: POST paginated pages (bookmarks
            // present), GET the first page.
            forcePost: options.bookmarks !== undefined,
        });
        return {
            data: env.resource_response.data,
            bookmark: env.resource_response.bookmark,
        };
    }
    /** Search hooks — typed convenience over the same endpoint. */
    async search(query, scope = "pins", extra = {}) {
        return this.searchPins({ query, scope, ...extra });
    }
    /** Search-box autocomplete terms. */
    async typeahead(term, options = {}) {
        const env = await this.c.transport.resource({
            name: "AdvancedTypeaheadResource",
            action: "get",
            options: {
                term,
                pin_scope: options.pinScope ?? "pins",
                autocomplete_request_surface: 0,
                ...(options.count !== undefined ? { count: options.count } : {}),
            },
            sourceUrl: "/",
        });
        return env.resource_response.data;
    }
}
