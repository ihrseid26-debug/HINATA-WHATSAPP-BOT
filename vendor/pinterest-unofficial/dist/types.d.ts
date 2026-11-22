/**
 * Shared entity models and response envelopes.
 *
 * Shapes are grounded in live captures (HTTP Toolkit) of the Pinterest
 * web client — see tests/fixtures for the raw request/response pairs that
 * these types were derived from. Keep them faithful; do not invent fields.
 */
/** Envelope returned by every `/resource/<Name>/<action>/` call. */
export interface ResourceEnvelope<TData = unknown> {
    resource_response: {
        status: string;
        code: number;
        message: string;
        endpoint_name: string;
        http_status?: number;
        x_pinterest_sli_endpoint_name?: string;
        /** For JSON-fed resources: nested v3 data payload. */
        data: TData;
        /** Pagination cursor — pass to the next call as `options.bookmarks`. */
        bookmark?: string;
        metadata?: unknown;
    };
    client_context: {
        analysis_ua: {
            app_type: number;
            app_version: string;
            browser_name: string;
            browser_version: string;
            device_type: string | null;
            device: string;
            os_name: string;
            os_version: string;
        };
        app_type_detected: number;
        app_type: number;
        [key: string]: unknown;
    };
    resource: {
        name: string;
        options: Record<string, unknown>;
    };
    request_identifier: string;
}
/** One Pinterest user (from `/v3/login_user` and pinners embedded in pins). */
export interface PinterestUser {
    id: string;
    node_id?: string;
    username: string;
    first_name?: string;
    full_name?: string;
    email?: string;
    created_at?: string;
    locale?: string;
    image_xlarge_url?: string;
    image_medium_url?: string;
    image_small_url?: string;
    image_large_url?: string;
    pin_count?: number;
    follower_count?: number;
    board_count?: number;
    is_employee?: boolean;
    is_write_banned?: boolean;
    has_password?: boolean;
    login_state?: number;
    type?: string | null;
    [key: string]: unknown;
}
/** Board summary embedded in a pin / as a search hit. */
export interface PinterestBoard {
    node_id?: string;
    id?: string;
    name?: string;
    url?: string;
    description?: string;
    pin_count?: number;
    collaborator_count?: number;
    image_cover_hd_url?: string;
    image_thumbnail_url?: string;
    layout?: string;
    privacy?: string;
    owner?: {
        id?: string;
        node_id?: string;
        username?: string;
        full_name?: string;
        image_medium_url?: string;
        type?: string | null;
    };
    followedByMe?: boolean;
    coverPin?: {
        imageUrl?: string;
        id?: string;
    };
    images236x?: Array<{
        url?: string;
        width?: number;
        height?: number;
    }>;
    collaboratingUsers?: string[];
    entityId?: string;
    __typename?: string;
    [key: string]: unknown;
}
/** Image set keyed by size label, e.g. `"236x"`, `"474x"`, `"1200x"` */
export type PinImageSet = Record<string, {
    url: string;
    width: number;
    height: number;
}>;
/** A Pin — search result, homefeed item, board feed item. */
export interface PinterestPin {
    id: string;
    node_id: string;
    type?: string;
    title?: string;
    grid_title?: string;
    description?: string;
    domain?: string | null;
    link?: string | null;
    created_at?: string;
    images?: PinImageSet;
    image_signature?: string;
    dominant_color?: string;
    auto_alt_text?: string;
    access?: unknown[];
    board?: PinterestBoard;
    pinner?: PinterestUser;
    aggregated_pin_data?: {
        aggregated_stats?: Record<string, unknown>;
        comment_count?: number;
        is_shopable?: boolean;
    };
    reaction_counts?: Record<string, number>;
    is_promoted?: boolean;
    is_stale_product?: boolean;
    is_eligible_for_pdp?: boolean;
    story_pin_data?: unknown;
    story_pin_data_id?: string;
    tracking_params?: string;
    should_open_in_stream?: boolean;
    closeup_unified_attribution?: unknown;
    [key: string]: unknown;
}
/** Search-result ranked guide ("anime wallpaper" etc.). */
export interface RankedGuide {
    term: string;
    display?: string;
    position: number;
    dominant_color: string;
    source: number;
    guideType: number;
    image_medium_url: string;
    subtracted_attributes: unknown[];
    score: number;
}
/** One "one bar" module above the filter rail on search results. */
export interface OneBarModule {
    animation: number;
    type: string;
    id: string;
    action: {
        title: string;
        type: string;
        id: string;
        id_reformatted?: string;
        filters?: Array<{
            type: string;
            [key: string]: unknown;
        }>;
    };
    display: unknown;
    module_type?: string;
    [key: string]: unknown;
}
/** `v3_search_pins` payload. */
export interface SearchPinsData {
    clientTrackingParams: string;
    nag: Record<string, never>;
    shouldAppendGlobalSearch: boolean;
    results: PinterestPin[];
    rankedGuides: RankedGuide[];
    sensitivity: Record<string, never>;
    oneBarModules: OneBarModule[];
    queryL1VerticalIds: number[];
}
/** `v3_login_user` payload. */
export interface LoginData {
    token_type: "bearer";
    user: PinterestUser;
}
/** `POST /secure/sso_info/` payload. */
export interface SsoInfoData {
    authorization_uri: string | null;
    existing_user: unknown;
    existing_user_is_sso: unknown;
    is_sso: boolean;
    redirect_uri: string | null;
    exchange_code_to_token_info_url: string | null;
    state_param: string | null;
    nonce_param: string | null;
}
/** GraphQL `/_/graphql/` response. */
export interface GraphqlEnvelope<TData = unknown> {
    data: TData;
    extensions?: unknown;
}
/** A GraphQL operation response keyed per the exact `variables` you sent. */
export interface BoardGraphqlVariables {
    [boardKey: string]: string | boolean | undefined;
}
/** `x-pinterest-graphql-name` operation names observed in captures. */
export declare const GRAPHQL_OPERATIONS: {
    readonly UnauthHomePageBrandBoardsEagerQuery: "UnauthHomePageBrandBoardsEagerQuery";
};
export type GraphqlOperationName = (typeof GRAPHQL_OPERATIONS)[keyof typeof GRAPHQL_OPERATIONS];
