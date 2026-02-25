/**
 * Client for calling the API worker.
 * Uses NEXT_PUBLIC_API_BASE_URL (e.g. http://127.0.0.1:8787 locally, https://newchums-api.*.workers.dev in prod).
 */

const getApiBase = () => {
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

let cachedToken: string | null = null;

async function getAuthToken(): Promise<string | null> {
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

export type ApiFetchOptions = RequestInit & { auth?: boolean };

/**
 * Fetch from the API worker.
 * @param path - e.g. "/auth/signup" or "/profile"
 * @param options - fetch options. Set auth: true for routes that require a Bearer token.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { auth = false, ...fetchOptions } = options;
  const base = getApiBase();
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
