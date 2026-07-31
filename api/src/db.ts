import { neon } from "@neondatabase/serverless";

export type Bindings = {
  DATABASE_URL: string;
  // Required in every environment (wrangler's generated worker-configuration.d.ts
  // declares it non-optional); the worker cannot mint or verify a token without it.
  NEXTAUTH_SECRET: string;
  MEDIA_BUCKET?: R2Bucket; // R2 bucket for media (avatars, etc.)
  CHAT_ROOM: DurableObjectNamespace;
  /** Optional KV for contact form rate limiting (5 per 10 min per IP). If unset, rate limit is skipped. */
  CONTACT_RATELIMIT_KV?: KVNamespace;
  /** Cloudflare Turnstile secret key for contact form (logged-out users). If unset, Turnstile is skipped. */
  TURNSTILE_SECRET_KEY?: string;
  /** Resend API key (https://resend.com). Stored as a Cloudflare Workers secret in prod. */
  RESEND_API_KEY: string;
  /** Test seam: override the Resend API base URL. Never set in production. */
  RESEND_BASE_URL?: string;
  /** Default From for transactional sends. Use "NewChums <no-reply@newchums.com>" in prod. */
  EMAIL_FROM: string;
  WEB_BASE_URL: string;
  SENTRY_DSN: string;
  APP_ENV?: string;
  ENVIRONMENT?: string;
  INTERNAL_TEST_TOKEN?: string;
  AXIOM_TOKEN?: string;
  AXIOM_DATASET?: string;
};

export const DATABASE_URL_HINT = "Run: npx wrangler secret put DATABASE_URL";

export const getSql = (env: Bindings) => {
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set. ${DATABASE_URL_HINT}`);
  }
  return neon(env.DATABASE_URL);
};
