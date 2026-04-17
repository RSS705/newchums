import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
};

// Runtime error capture (sentry.server.config.ts, sentry.edge.config.ts,
// instrumentation-client.ts) works independently of this wrap. What
// withSentryConfig adds at build time is:
//   1. The /monitoring tunnel route (helps browser events bypass ad-blockers).
//   2. Release creation + source-map upload to Sentry (for readable stack
//      traces on production errors).
//
// On Next 16 + Turbopack, #2 runs via a runAfterProductionCompile hook that
// talks to the Sentry API. Normally it takes ~10s. If Sentry is unreachable
// the errorHandler lets the deploy continue; the timeout wrapper below is a
// second safety net against an indefinite hang (which we hit once — likely a
// transient network issue — and don't want to block a deploy to newchums.com).
const hasSentryUploadCreds = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

const sentryConfig = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",

  sourcemaps: { disable: !hasSentryUploadCreds },
  useRunAfterProductionCompileHook: hasSentryUploadCreds,
  debug: process.env.SENTRY_DEBUG === "1",
  errorHandler: (err) => {
    // eslint-disable-next-line no-console
    console.warn("[sentry] non-fatal source-map upload error:", err.message);
  },

  webpack: {
    automaticVercelMonitors: true,
    treeshake: { removeDebugLogging: true },
  },
});

// Cap the Sentry post-compile hook so an unresponsive Sentry API can't stall a
// deploy forever. On timeout we log and proceed; the deploy ships without
// fresh source maps for that release (errors still reach Sentry, stack traces
// will be minified until the next successful upload).
const SENTRY_HOOK_TIMEOUT_MS = 3 * 60 * 1000;
const sentryHook = sentryConfig.compiler?.runAfterProductionCompile;
if (typeof sentryHook === "function") {
  sentryConfig.compiler!.runAfterProductionCompile = async (ctx) => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Sentry runAfterProductionCompile exceeded ${SENTRY_HOOK_TIMEOUT_MS}ms`,
            ),
          ),
        SENTRY_HOOK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([sentryHook(ctx), timeout]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[sentry] source-map upload skipped:",
        err instanceof Error ? err.message : err,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export default sentryConfig;
