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
import type { PinterestBoard } from "../types.js";
import type { PinterestClient } from "../client.js";
export interface ListBoardsOptions {
    username: string;
    pageSize?: number;
    privacyFilter?: "all" | "public" | "secret";
    sort?: "last_pinned_to" | "PINS" | "created_at";
}
export interface CreateBoardOptions {
    name: string;
    description?: string;
    privacy?: "public" | "secret";
    collabBoardEmail?: boolean;
    source?: string;
}
export interface BoardPickerOptions {
    fieldSetKey?: "board_picker";
    filter?: "all" | "sections";
}
export declare class BoardsResource {
    private readonly c;
    constructor(c: PinterestClient);
    /** List a user's boards (`BoardsResource/get`, endpoint v3_user_profile_boards_feed). */
    list(options: ListBoardsOptions): Promise<PinterestBoard[]>;
    /** Create a board (`BoardResource/create`). */
    create(options: CreateBoardOptions): Promise<PinterestBoard>;
    /** Board picker feed (`BoardPickerBoardsResource/get`). */
    picker(options?: BoardPickerOptions): Promise<{
        boards: PinterestBoard[];
        createSuggestions: string[];
    }>;
}
