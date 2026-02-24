import { neon } from "@neondatabase/serverless";

export type Bindings = {
  DATABASE_URL: string;
  NEXTAUTH_SECRET?: string; // Required for auth routes (profile, user/username, user/date-of-birth)
  POSTMARK_SERVER_TOKEN: string;
  EMAIL_FROM: string;
  WEB_BASE_URL: string;
  POSTMARK_TEMPLATE_VERIFY: string;
  POSTMARK_TEMPLATE_RESET: string;
  POSTMARK_TEMPLATE_RSVP: string;
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
