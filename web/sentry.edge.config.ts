// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://0faa4247e1a18af83b0683f70cd8e290@o4510868883046400.ingest.us.sentry.io/4510868891369472",

  // Disabled for the public pilot. See sentry.server.config.ts for the
  // rationale and for the guidance on attaching safe user context
  // manually when an incident actually needs it.
  sendDefaultPii: false,
});
