/**
 * Client for calling the API worker.
 * Uses NEXT_PUBLIC_API_BASE_URL (e.g. http://127.0.0.1:8787 locally, https://newchums-api.*.workers.dev in prod).
 */
export const getApiBaseUrl = () => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  const normalized = base.replace(/\/$/, "");

  // Fail fast if production site would call localhost (baked at build time)
  if (
    typeof window !== "undefined" &&
    (normalized.includes("127.0.0.1") || normalized.includes("localhost"))
  ) {
    const host = window.location?.hostname ?? "";
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL cannot be localhost in production. Rebuild with production API URL."
      );
    }
  }
  return normalized;
};

/**
 * Primary base URL for reading avatar/banner images from R2.
 * Uses the local API so images uploaded locally are immediately visible.
 */
export const getAvatarBaseUrl = () => getApiBaseUrl();

/**
 * Secondary base URL for reading images, used as an `onError` fallback.
 * Returns NEXT_PUBLIC_AVATAR_BASE_URL when it differs from the primary API
 * base (i.e. local dev pointing at a production R2 bucket for images that
 * were uploaded through the production site). Returns null in production
 * where both values are identical.
 */
export const getImageFallbackBaseUrl = (): string | null => {
  const explicit = process.env.NEXT_PUBLIC_AVATAR_BASE_URL?.replace(/\/$/, "");
  if (!explicit) return null;
  try {
    const primary = getApiBaseUrl();
    return explicit !== primary ? explicit : null;
  } catch {
    return explicit;
  }
};

let cachedToken: string | null = null;
/** Unix ms at which the cached token should be considered expired (1-min buffer baked in). */
let cachedTokenExpiry = 0;

/**
 * Decode the `exp` claim from a JWT payload without verifying the signature.
 * Returns the expiry as a Unix ms timestamp minus a 60-second safety buffer,
 * so we proactively refresh before the server rejects it.
 */
function extractTokenExpiry(token: string): number {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === "number" ? (payload.exp - 60) * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  // Return cached token only if it has not yet reached its expiry (with buffer).
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;
  // Cache is stale or empty — clear and fetch a fresh token.
  cachedToken = null;
  cachedTokenExpiry = 0;
  try {
    const res = await fetch("/api/auth/api-token", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && typeof data.token === "string") {
      cachedToken = data.token;
      cachedTokenExpiry = extractTokenExpiry(data.token);
      return cachedToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearAuthTokenCache() {
  cachedToken = null;
  cachedTokenExpiry = 0;
}

export type ApiFetchOptions = RequestInit & {
  auth?: boolean;
  /** Override base URL (e.g. use prod API for media when sharing DB with local) */
  baseUrl?: string;
};

/**
 * Base URL for media operations (init, upload, finalize).
 * Always the same as the API base so auth tokens are valid.
 */
export const getMediaApiBaseUrl = () => getApiBaseUrl();

export function getChatWebSocketUrl(eventId: string, token: string): string {
  const base = getApiBaseUrl().replace(/^http/, "ws");
  return `${base}/events/${eventId}/chat/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Fetch from the API worker.
 * @param path - e.g. "/auth/signup" or "/profile"
 * @param options - fetch options. Set auth: true for routes that require a Bearer token.
 *   Use baseUrl to call a different API (e.g. prod for media when sharing DB).
 *
 * For authenticated requests, automatically retries once on 401/403 after clearing the
 * token cache and fetching a fresh token. This covers edge cases where the token expired
 * between the cache check and the time the API worker validates it.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { auth = false, baseUrl, ...fetchOptions } = options;
  const base = baseUrl ?? getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const buildHeaders = (token?: string | null): Headers => {
    const h = new Headers(fetchOptions.headers);
    if (token) h.set("Authorization", `Bearer ${token}`);
    if (!h.has("Content-Type") && fetchOptions.body) {
      h.set("Content-Type", "application/json");
    }
    return h;
  };

  const token = auth ? await getAuthToken() : null;
  const res = await fetch(url, {
    ...fetchOptions,
    headers: buildHeaders(token),
    credentials: "omit",
  });

  // On 401/403 for authenticated requests, clear the cache and retry once with a fresh token.
  // The expiry-aware cache above should prevent most occurrences, but this acts as a safety net.
  if (auth && (res.status === 401 || res.status === 403)) {
    clearAuthTokenCache();
    const freshToken = await getAuthToken();
    if (freshToken) {
      return fetch(url, {
        ...fetchOptions,
        headers: buildHeaders(freshToken),
        credentials: "omit",
      });
    }
  }

  return res;
}
