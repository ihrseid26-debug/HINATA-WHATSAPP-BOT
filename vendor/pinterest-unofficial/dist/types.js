/**
 * Shared entity models and response envelopes.
 *
 * Shapes are grounded in live captures (HTTP Toolkit) of the Pinterest
 * web client — see tests/fixtures for the raw request/response pairs that
 * these types were derived from. Keep them faithful; do not invent fields.
 */
/** `x-pinterest-graphql-name` operation names observed in captures. */
export const GRAPHQL_OPERATIONS = {
    UnauthHomePageBrandBoardsEagerQuery: "UnauthHomePageBrandBoardsEagerQuery",
};
