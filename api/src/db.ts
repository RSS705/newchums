import { neon } from "@neondatabase/serverless";

export type Bindings = {
  DATABASE_URL: string;
};

export const DATABASE_URL_HINT =
  "Run: npx wrangler secret put DATABASE_URL";

export const getSql = (env: Bindings) => {
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set. ${DATABASE_URL_HINT}`);
  }
  return neon(env.DATABASE_URL);
};
