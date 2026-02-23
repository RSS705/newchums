import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext config for Cloudflare Workers.
 * Uses defaults; no R2/D1/DO required for basic SSR.
 * See https://opennext.js.org/cloudflare/caching for caching options.
 */
export default defineCloudflareConfig({});
