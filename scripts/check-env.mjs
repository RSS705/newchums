import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_WEB_KEYS = [
  "AUTH_SECRET",
  "AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "DATABASE_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
];

const REQUIRED_API_KEYS = [
  "APP_ENV",
  "DATABASE_URL",
  "SENTRY_DSN",
  "AXIOM_TOKEN",
  "AXIOM_DATASET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "WEB_BASE_URL",
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

const EXAMPLE_FILES = {
  web: "web/.env.example",
  api: "api/.dev.vars.example",
};

const TARGET_FILES = {
  web: "web/.env.local",
  api: "api/.dev.vars",
};

const checkFile = (label, targetPath, examplePath, requiredKeys, optionalKeys = []) => {
  const filePath = resolve(process.cwd(), targetPath);
  if (!existsSync(filePath)) {
    console.error(`[${label}] Missing file: ${targetPath}`);
    console.error(`[${label}] Copy ${examplePath} to ${targetPath} and fill in the values.`);
    return false;
  }

  const keys = parseEnvKeys(filePath);
  const missingRequired = requiredKeys.filter((key) => !keys.has(key));
  const missingOptional = optionalKeys.filter((key) => !keys.has(key));

  if (missingRequired.length === 0) {
    console.log(`[${label}] OK`);
  } else {
    console.error(`[${label}] Missing required keys: ${missingRequired.join(", ")}`);
    console.error(`[${label}] Copy ${examplePath} to ${targetPath} and fill in the values.`);
  }

  if (missingOptional.length > 0) {
    console.warn(`[${label}] Missing optional keys: ${missingOptional.join(", ")}`);
  }

  return missingRequired.length === 0;
};

const webOk = checkFile(
  "web",
  TARGET_FILES.web,
  EXAMPLE_FILES.web,
  REQUIRED_WEB_KEYS,
);
const apiOk = checkFile(
  "api",
  TARGET_FILES.api,
  EXAMPLE_FILES.api,
  REQUIRED_API_KEYS,
  OPTIONAL_API_KEYS,
);

if (!webOk || !apiOk) {
  process.exit(1);
}
