/**
 * Error hierarchy for the Pinterest client.
 *
 * Every failure thrown by the SDK is one of these types, so callers can
 * discriminate without string-matching.
 */
/** Base class for all SDK errors. */
export class PinterestError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = new.target.name;
    }
}
/** An HTTP-level failure: network error, non-2xx status, bad content-type. */
export class PinterestHttpError extends PinterestError {
    status;
    statusText;
    url;
    constructor(url, status, statusText, message, options) {
        super(`${message} (HTTP ${status} ${statusText} — ${url})`, options);
        this.status = status;
        this.statusText = statusText;
        this.url = url;
    }
}
/**
 * Pinterest answered with a non-success resource envelope.
 *
 * Covers both:
 *  - `resource_response.status !== "success"` (e.g. `"error"`, `"auth_error"`)
 *  - `resource_response.code !== 0`
 */
export class PinterestResourceError extends PinterestError {
    endpointName;
    code;
    status;
    resourceResponse;
    constructor(message, resourceResponse, endpointName, code, status) {
        super(message);
        this.resourceResponse = resourceResponse;
        this.endpointName = endpointName;
        this.code = code;
        this.status = status;
    }
}
/** CSRF check failed (403 with x-csrftoken missing/stale). Re-bootstrap and retry once. */
export class PinterestCsrfError extends PinterestHttpError {
}
/** The session is not authenticated but the endpoint requires it. */
export class PinterestAuthError extends PinterestHttpError {
}
