const DEFAULT_REDIRECT_PATH = "/home";

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
    return getSafeRedirectPath(requestPath);
  }

  const nextUrl = requestHeaders.get("next-url");
  const invokePath = requestHeaders.get("x-invoke-path") ?? requestHeaders.get("x-matched-path");
  const invokeQuery = requestHeaders.get("x-invoke-query");

  const requestedPath = nextUrl ?? mergePathAndQuery(invokePath, invokeQuery);
  return getSafeRedirectPath(requestedPath);
}
