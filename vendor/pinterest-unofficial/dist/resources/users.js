/**
 * Users — `UserResource/get`, plus the `/v3/` REST proxy for /users routes.
 *
 * Grounded in captures:
 *  - GET `UserResource/get/` with `{user_id}` or `{username}` and
 *    optional `field_set_key` ("profile", "grid_item", "save_behavior",
 *    "linked_partner").
 *  - `/v3/users/me/`, `/v3/users/<username>/metadata/` via ApiResource.
 */
export class UserResourceImpl {
    c;
    constructor(c) {
        this.c = c;
    }
    /** Fetch a user by id or username (legacy `/resource/UserResource/get/`). */
    async get(options) {
        if (!options.userId && !options.username) {
            throw new Error("UserResource.get requires userId or username");
        }
        const opts = {};
        if (options.userId !== undefined)
            opts.user_id = options.userId;
        if (options.username !== undefined)
            opts.username = options.username;
        if (options.fieldSetKey !== undefined)
            opts.field_set_key = options.fieldSetKey;
        // Captured shape: resource_response.data IS the user object
        // (endpoint_name v3_get_user_handler).
        const env = await this.c.transport.resource({
            name: "UserResource",
            action: "get",
            options: opts,
            sourceUrl: "/",
        });
        return env.resource_response.data;
    }
    /**
     * `/v3/users/me/` via the ApiResource proxy — the logged-in user.
     *
     * Captured shape: `client_context.user` carries the full user object;
     * `resource_response.data` carries only the requested fields, flattened.
     */
    async me() {
        const env = await this.c.transport.resource({
            name: "ApiResource",
            action: "get",
            options: {
                url: "/v3/users/me/",
                data: {
                    fields: [
                        "user.id",
                        "user.username",
                        "user.full_name",
                        "user.email",
                        "user.image_xlarge_url",
                        "user.pin_count",
                    ],
                },
            },
            sourceUrl: "/",
        });
        const fullUser = env.client_context.user;
        if (fullUser !== undefined)
            return fullUser;
        // Fallback: the flattened field set is all we got.
        return env.resource_response.data;
    }
    /** `/v3/users/<username>/metadata/` — profile metadata. */
    async metadata(username) {
        const env = await this.c.transport.resource({
            name: "ApiResource",
            action: "get",
            options: {
                url: `/v3/users/${username}/metadata/`,
                data: {},
            },
            sourceUrl: "/",
        });
        return env.resource_response.data;
    }
}
