// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://0faa4247e1a18af83b0683f70cd8e290@o4510868883046400.ingest.us.sentry.io/4510868891369472",

  // Disabled for the public pilot. With this flag on, Sentry auto-attaches
  // the authenticated user's email and IP address to every error event,
  // which is more PII than we want in the error stream. If a future
  // incident needs richer user context, attach only non-sensitive fields
  // (user id, role, subscription tier, environment) explicitly via
  // Sentry.setUser / Sentry.setContext at the call site. Do not attach
  // email, IP, display name, exact location, invite/share tokens, or URLs
  // carrying sensitive query params.
  sendDefaultPii: false,
});
