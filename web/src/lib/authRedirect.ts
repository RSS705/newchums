/** Single source of truth for post-auth default landing. */
export const DEFAULT_POST_AUTH_REDIRECT = "/";

const DEFAULT_REDIRECT_PATH = DEFAULT_POST_AUTH_REDIRECT;

export function getSafeRedirectPath(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_REDIRECT_PATH;
  }

  const normalized = value.trim();
  const lowerValue = normalized.toLowerCase();

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  if (
    lowerValue.includes("://") ||
    lowerValue.startsWith("http:") ||
    lowerValue.startsWith("https:")
  ) {
    return DEFAULT_REDIRECT_PATH;
  }

  return normalized;
}

function mergePathAndQuery(path: string | null, query: string | null): string | null {
  if (!path) {
    return null;
  }

  if (!query) {
    return path;
  }

  const normalizedQuery = query.startsWith("?") ? query : `?${query}`;
  return `${path}${normalizedQuery}`;
}

export function getRequestedPathFromHeaders(requestHeaders: Headers): string {
  const requestPath = requestHeaders.get("x-request-path");
  if (requestPath) {
    const search = requestHeaders.get("x-request-search") ?? "";
    return getSafeRedirectPath(requestPath + search);
  }

  const nextUrl = requestHeaders.get("next-url");
  const invokePath = requestHeaders.get("x-invoke-path") ?? requestHeaders.get("x-matched-path");
  const invokeQuery = requestHeaders.get("x-invoke-query");

  const requestedPath = nextUrl ?? mergePathAndQuery(invokePath, invokeQuery);
  return getSafeRedirectPath(requestedPath);
}

/**
 * Returns the raw search string ("?foo=bar") for the current request, or "".
 * Used by server components to inspect query params without round-tripping
 * through the client.
 */
export function getRequestedSearchFromHeaders(requestHeaders: Headers): string {
  return requestHeaders.get("x-request-search") ?? "";
}
