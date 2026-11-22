/**
 * Users — `UserResource/get`, plus the `/v3/` REST proxy for /users routes.
 *
 * Grounded in captures:
 *  - GET `UserResource/get/` with `{user_id}` or `{username}` and
 *    optional `field_set_key` ("profile", "grid_item", "save_behavior",
 *    "linked_partner").
 *  - `/v3/users/me/`, `/v3/users/<username>/metadata/` via ApiResource.
 */
import type { PinterestUser } from "../types.js";
import type { PinterestClient } from "../client.js";
export type UserFieldSetKey = "profile" | "grid_item" | "save_behavior" | "linked_partner";
export interface GetUserOptions {
    userId?: string;
    username?: string;
    fieldSetKey?: UserFieldSetKey;
}
export declare class UserResourceImpl {
    private readonly c;
    constructor(c: PinterestClient);
    /** Fetch a user by id or username (legacy `/resource/UserResource/get/`). */
    get(options: GetUserOptions): Promise<PinterestUser>;
    /**
     * `/v3/users/me/` via the ApiResource proxy — the logged-in user.
     *
     * Captured shape: `client_context.user` carries the full user object;
     * `resource_response.data` carries only the requested fields, flattened.
     */
    me(): Promise<PinterestUser>;
    /** `/v3/users/<username>/metadata/` — profile metadata. */
    metadata(username: string): Promise<Record<string, unknown>>;
}
