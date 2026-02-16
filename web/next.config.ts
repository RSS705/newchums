import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

const hasSentryReleaseConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

// Disable the Sentry webpack plugin on Cloudflare Pages builds.
// The plugin injects duplicate identifiers that cause next-on-pages to abort.
// Sentry runtime (sentry.server.config.ts, sentry.edge.config.ts) is unaffected.
const isCloudflarePagesBuild = Boolean(
  process.env.CF_PAGES === "1" || process.env.CF_PAGES_BRANCH,
);

const sentryNextConfig = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options
  org: process.env.SENTRY_ORG as string,
  project: process.env.SENTRY_PROJECT as string,
  authToken: process.env.SENTRY_AUTH_TOKEN as string,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: "/monitoring",

  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },

  // Disable the webpack plugin on Cloudflare Pages to prevent the
  // "duplicated identifier" error during next-on-pages bundling.
  unstable_sentryWebpackPluginOptions: isCloudflarePagesBuild
    ? { disable: true }
    : undefined,
});

export default hasSentryReleaseConfig ? sentryNextConfig : nextConfig;
