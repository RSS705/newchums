import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_WEB_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
];

const REQUIRED_API_KEYS = [
  "APP_ENV",
  "DATABASE_URL",
  "SENTRY_DSN",
  "AXIOM_TOKEN",
  "AXIOM_DATASET",
  "POSTMARK_SERVER_TOKEN",
  "EMAIL_FROM",
  "WEB_BASE_URL",
  "POSTMARK_TEMPLATE_VERIFY",
  "POSTMARK_TEMPLATE_RESET",
  "POSTMARK_TEMPLATE_RSVP",
];

const OPTIONAL_API_KEYS = ["INTERNAL_TEST_TOKEN"];

const parseEnvKeys = (filePath) => {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const keys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    keys.add(trimmed.slice(0, eqIndex).trim());
  }

  return keys;
};

const checkFile = (label, relativePath, requiredKeys, optionalKeys = []) => {
  const filePath = resolve(process.cwd(), relativePath);
  if (!existsSync(filePath)) {
    console.error(`[${label}] Missing file: ${relativePath}`);
    return false;
  }

  const keys = parseEnvKeys(filePath);
  const missingRequired = requiredKeys.filter((key) => !keys.has(key));
  const missingOptional = optionalKeys.filter((key) => !keys.has(key));

  if (missingRequired.length === 0) {
    console.log(`[${label}] OK`);
  } else {
    console.error(`[${label}] Missing required keys: ${missingRequired.join(", ")}`);
  }

  if (missingOptional.length > 0) {
    console.warn(`[${label}] Missing optional keys: ${missingOptional.join(", ")}`);
  }

  return missingRequired.length === 0;
};

const webOk = checkFile("web", "web/.env.local", REQUIRED_WEB_KEYS);
const apiOk = checkFile(
  "api",
  "api/.dev.vars",
  REQUIRED_API_KEYS,
  OPTIONAL_API_KEYS,
);

if (!webOk || !apiOk) {
  process.exit(1);
}
