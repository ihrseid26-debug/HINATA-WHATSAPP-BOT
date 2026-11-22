/**
 * Boards — list/create/pick via `BoardsResource`, `BoardResource`,
 * `BoardPickerBoardsResource`.
 *
 * Grounded in captures:
 *  - GET `BoardsResource/get/` — `{page_size, privacy_filter, sort,
 *    username}`.
 *  - POST `BoardResource/create/` — `{name, description, privacy,
 *    collab_board_email, aux_data}`.
 *  - GET `BoardPickerBoardsResource/get/` — `{field_set_key:
 *    "board_picker", filter: "all"}` (board picker in pin-creation-tool).
 */
export class BoardsResource {
    c;
    constructor(c) {
        this.c = c;
    }
    /** List a user's boards (`BoardsResource/get`, endpoint v3_user_profile_boards_feed). */
    async list(options) {
        // Captured shape: resource_response.data IS the array of boards.
        const env = await this.c.transport.resource({
            name: "BoardsResource",
            action: "get",
            options: {
                page_size: options.pageSize ?? 25,
                privacy_filter: options.privacyFilter ?? "all",
                sort: options.sort ?? "last_pinned_to",
                username: options.username,
            },
            sourceUrl: "/",
        });
        return env.resource_response.data;
    }
    /** Create a board (`BoardResource/create`). */
    async create(options) {
        const env = await this.c.transport.resource({
            name: "BoardResource",
            action: "create",
            options: {
                name: options.name,
                description: options.description ?? "",
                privacy: options.privacy ?? "public",
                collab_board_email: options.collabBoardEmail ?? true,
                aux_data: { source: options.source ?? "board_picker" },
            },
            sourceUrl: "/pin-creation-tool/",
            method: "POST",
        });
        return env.resource_response.data;
    }
    /** Board picker feed (`BoardPickerBoardsResource/get`). */
    async picker(options = {}) {
        // Captured shape: data = { all_boards: [], boards_shortlist: [],
        // create_suggestions: [...] }.
        const env = await this.c.transport.resource({
            name: "BoardPickerBoardsResource",
            action: "get",
            options: {
                field_set_key: options.fieldSetKey ?? "board_picker",
                filter: options.filter ?? "all",
            },
            sourceUrl: "/pin-creation-tool/",
        });
        const data = env.resource_response.data;
        return {
            boards: data?.all_boards ?? data?.boards_shortlist ?? [],
            createSuggestions: data?.create_suggestions ?? [],
        };
    }
}
