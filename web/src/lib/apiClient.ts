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
 * Canonical base URL for avatar images. Use this for avatar img src so both local and prod
 * resolve avatars from the same origin (production API + R2), enabling cross-env consistency
 * when sharing the same DB.
 * Falls back to NEXT_PUBLIC_API_BASE_URL if not set.
 */
export const getAvatarBaseUrl = () => {
  const base =
    process.env.NEXT_PUBLIC_AVATAR_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_AVATAR_BASE_URL or NEXT_PUBLIC_API_BASE_URL is not set");
  return base.replace(/\/$/, "");
};

let cachedToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch("/api/auth/api-token", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && typeof data.token === "string") {
      cachedToken = data.token;
      return cachedToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearAuthTokenCache() {
  cachedToken = null;
}

export type ApiFetchOptions = RequestInit & {
  auth?: boolean;
  /** Override base URL (e.g. use prod API for media when sharing DB with local) */
  baseUrl?: string;
};

/**
 * Base URL for media/avatar operations. When set, use for init/upload/finalize so both
 * local and prod write to the same R2, enabling cross-env consistency when sharing DB.
 */
export const getMediaApiBaseUrl = () => getAvatarBaseUrl();

export function getChatWebSocketUrl(eventId: string, token: string): string {
  const base = getApiBaseUrl().replace(/^http/, "ws");
  return `${base}/events/${eventId}/chat/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Fetch from the API worker.
 * @param path - e.g. "/auth/signup" or "/profile"
 * @param options - fetch options. Set auth: true for routes that require a Bearer token.
 *   Use baseUrl to call a different API (e.g. prod for media when sharing DB).
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { auth = false, baseUrl, ...fetchOptions } = options;
  const base = baseUrl ?? getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(fetchOptions.headers);
  if (auth) {
    const token = await getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && fetchOptions.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...fetchOptions,
    headers,
    credentials: "omit",
  });
}
