# Technical Specs

**Last Updated:** February 18, 2026 **Version:** 1.13

## Cloudflare Pages + Next.js Runtime Rules

Our web app deploys to **Cloudflare Pages** using the Vercel output build pipeline. Cloudflare requires **all non-static App Router routes** to run in **Edge Runtime**.

### Why This Matters

-   Any route using `cookies()`, `headers()`, `auth()`, `getServerSession()`, or other server/dynamic APIs becomes **dynamic** (non-static).
-   Dynamic routes without `runtime = "edge"` cause Cloudflare Pages builds to fail with:
    ```
    The following routes were not configured to run with the Edge Runtime:
      - /index
    ```
-   **`/index`** in the error refers to the root route **`/`** in our pipeline.

### Required Configuration

For every **dynamic** route, add at the top of the route file:

```ts
/** Cloudflare Pages requires runtime='edge' for dynamic routes. */
export const runtime = "edge";
```

### Common Causes of Dynamic Routes

-   `auth()` or `getServerSession()` (session checks)
-   `cookies()`, `headers()`, `draftMode()` from `next/headers`
-   `fetch` with `{ cache: "no-store" }` or `revalidate = 0`
-   `export const dynamic = "force-dynamic"`
-   Database calls (Neon `sql`, etc.) — these are Edge-compatible but make the route dynamic
-   Node-only imports (`fs`, `path`, `crypto` via Node) — avoid in dynamic routes; use Edge-safe alternatives

### Adding New Routes Checklist

1.  **Is the route static?** (No server calls, no dynamic data.) If yes → no action.
2.  **Is the route dynamic?** If yes → add `export const runtime = "edge";`.
3.  **Does it import Node-only modules?** If yes → refactor to Edge-safe alternatives (e.g. Web Crypto, fetch).
4.  **Run local build:** `cd web && npm run build`. Confirm no "routes were not configured" errors.
5.  **If build reports `/index`:** The offending route is the root page at `web/src/app/(public)/page.tsx`.

### Finding the Offending Route

-   Build logs list routes with `ƒ` (dynamic) vs `○` (static).
-   Cloudflare error messages use path format like `/index` for `/`, `/login` for `/login`, etc.
-   Route files: `web/src/app/**/page.tsx` and layouts `**/layout.tsx`. The route segment config must be in the page or layout that is dynamic.

### Preferred Approach

-   **Prefer keeping marketing/home static** when possible; move session-specific UI to client components or middleware.
-   When a route **must** be dynamic (e.g. root page needs auth/onboarding gate), use `runtime = "edge"` and ensure all imports are Edge-compatible (Neon, Auth.js JWT, etc.).

## Post-Auth Redirect

-   **Default landing:** `/` (not `/home` or dashboard)
-   **Source of truth:** `web/src/lib/authRedirect.ts` — `DEFAULT_POST_AUTH_REDIRECT`, `getSafeRedirectPath`, `getRequestedPathFromHeaders`
-   **Rules:** Honor safe `callbackUrl`/`returnTo` (relative internal paths only); new Google users complete onboarding first, then redirect to `/` or `returnTo`

## Root Page (`/`)

-   **File:** `web/src/app/(public)/page.tsx` — exports `runtime = "edge"` (Cloudflare Pages requirement)
-   **Logged out:** `LandingLayout` + `LandingHero` (Login / Sign up)
-   **Logged in + onboarded:** Same landing layout with `isLoggedIn`: header shows Logout; hero shows Browse events / My profile
-   **Logged in + not onboarded:** Redirect to `/onboarding/username?returnTo=/`
-   **Dashboard (AppShell)** is used on `/home`, `/events`, `/profile`, etc. — not on `/`

## Username Architecture

Case-preserving display. Case-insensitive uniqueness.

Columns: - username - username_norm

Index: idx_users_username_norm

## Validation

Regex: [^1]{3,20}\$ No leading/trailing underscore. Confirm password
required.

## Error Handling

409 EMAIL_EXISTS 409 USERNAME_TAKEN 400 INVALID_USERNAME 400 UNDERAGE
(date_of_birth) 500 SERVER_ERROR

[^1]: A-Za-z0-9\_

## Date Picker

-   **Library:** @mui/x-date-pickers + dayjs
-   **Adapter:** AdapterDayjs (LocalizationProvider in ThemeRegistry)
-   **Component:** `components/fields/NCDatePicker.tsx` — value/onChange as YYYY-MM-DD
