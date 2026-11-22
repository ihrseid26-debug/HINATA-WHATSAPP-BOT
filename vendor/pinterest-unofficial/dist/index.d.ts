/**
 * pinterest-unofficial — unofficial Pinterest SDK.
 *
 * Reverse-engineered from live HTTP captures (HTTP Toolkit) of the
 * Pinterest web client. TypeScript, zero runtime dependencies (Node 18+
 * native fetch).
 */
export { PinterestClient } from "./client.js";
export * from "./types.js";
export * from "./errors.js";
export { PinterestTransport, decodeDataParam, parseEventStream, DEFAULT_UA, } from "./transport.js";
export type { PinterestTransportOptions, ResourceAction, ResourceCallInit, } from "./transport.js";
export { CookieJar } from "./cookies.js";
export type { LoginOptions, SsoInfoOptions, PuppeteerLoginOptions, } from "./resources/auth.js";
export type { SearchPinsOptions, SearchScope, PinterestTypeaheadResult, } from "./resources/search.js";
export type { ListBoardsOptions, CreateBoardOptions, BoardPickerOptions, } from "./resources/boards.js";
export type { GetUserOptions, UserFieldSetKey, } from "./resources/users.js";
export type { HomeFeedOptions, ApiResourceOptions, } from "./resources/feed.js";
export type { PinDetail, AggregatedComment, RelatedModule, GetPinOptions, RelatedPinsOptions, GetCommentsOptions, AddCommentOptions, } from "./resources/pins.js";
