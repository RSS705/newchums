/**
 * Current legal document versions, single source of truth for the web app.
 *
 * Keep in sync with CURRENT_TERMS_VERSION / CURRENT_PRIVACY_VERSION in
 * api/src/index.ts. The API pins its own copy on every write so a client can
 * never claim acceptance of a version that does not exist; these constants
 * exist for the paths the web worker records directly (first sign-in through
 * an OAuth provider) and for the legacy catch-up interstitial.
 */
export const CURRENT_TERMS_VERSION = "2026-03-17";
export const CURRENT_PRIVACY_VERSION = "2026-03-17";
