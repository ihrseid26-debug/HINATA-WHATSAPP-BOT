/**
 * Error hierarchy for the Pinterest client.
 *
 * Every failure thrown by the SDK is one of these types, so callers can
 * discriminate without string-matching.
 */
/** Base class for all SDK errors. */
export declare class PinterestError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/** An HTTP-level failure: network error, non-2xx status, bad content-type. */
export declare class PinterestHttpError extends PinterestError {
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    constructor(url: string, status: number, statusText: string, message: string, options?: {
        cause?: unknown;
    });
}
/**
 * Pinterest answered with a non-success resource envelope.
 *
 * Covers both:
 *  - `resource_response.status !== "success"` (e.g. `"error"`, `"auth_error"`)
 *  - `resource_response.code !== 0`
 */
export declare class PinterestResourceError extends PinterestError {
    readonly endpointName: string | undefined;
    readonly code: number | undefined;
    readonly status: string | undefined;
    readonly resourceResponse: unknown;
    constructor(message: string, resourceResponse: unknown, endpointName?: string, code?: number, status?: string);
}
/** CSRF check failed (403 with x-csrftoken missing/stale). Re-bootstrap and retry once. */
export declare class PinterestCsrfError extends PinterestHttpError {
}
/** The session is not authenticated but the endpoint requires it. */
export declare class PinterestAuthError extends PinterestHttpError {
}
