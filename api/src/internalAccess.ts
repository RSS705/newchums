import type { Context } from "hono";
import type { Bindings } from "./db";

const PROD_NAMES = new Set(["production", "prod"]);
const NON_PROD_NAMES = new Set(["development", "dev", "preview", "staging"]);

const readAppEnv = (env: Bindings) =>
  (env.APP_ENV ?? env.ENVIRONMENT ?? "").trim().toLowerCase();

export const isProductionEnv = (env: Bindings) =>
  PROD_NAMES.has(readAppEnv(env));

const isKnownNonProductionEnv = (env: Bindings) =>
  NON_PROD_NAMES.has(readAppEnv(env));

const isLocalRequest = (url: string) => {
  const { hostname } = new URL(url);
  return hostname === "127.0.0.1" || hostname === "localhost";
};

export const hasValidInternalToken = (
  c: Context<{ Bindings: Bindings }>,
): boolean => {
  const expected = c.env.INTERNAL_TEST_TOKEN;
  if (!expected) {
    return false;
  }

  const provided = c.req.header("x-internal-token");
  return typeof provided === "string" && provided === expected;
};

export const canAccessInternalTestRoute = (
  c: Context<{ Bindings: Bindings }>,
) => {
  if (isKnownNonProductionEnv(c.env) || isLocalRequest(c.req.url)) {
    return true;
  }

  if (isProductionEnv(c.env)) {
    return hasValidInternalToken(c);
  }

  // Fail closed when APP_ENV/ENVIRONMENT is not configured on non-local hosts.
  return hasValidInternalToken(c);
};

export const notFound = () =>
  new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=UTF-8" },
  });
