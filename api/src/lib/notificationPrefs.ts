/**
 * Notification preferences: single source of truth for API.
 * Valid keys, defaults, and allowed frequencies.
 */

export const FREQUENCY_VALUES = [
  "immediately",
  "daily",
  "every_3_days",
  "weekly",
  "monthly",
  "never",
] as const;

export type Frequency = (typeof FREQUENCY_VALUES)[number];

export type NotificationPrefItem = {
  enabled: boolean;
  frequency: Frequency;
};

export type NotificationPreferences = {
  version: 1;
  items: Record<string, NotificationPrefItem>;
};

export const VALID_KEYS = [
  "event_match",
  "host_join",
  "host_leave",
  "feedback_requests",
  "event_reminders",
  "event_changed_canceled",
  "product_announcements",
] as const;

export type NotificationKey = (typeof VALID_KEYS)[number];

/** Keys that are on/off only; frequency is ignored (triggers day-after or 24h before) */
const ON_OFF_ONLY_KEYS: NotificationKey[] = ["feedback_requests", "event_reminders"];

export function isOnOffOnlyKey(key: NotificationKey): boolean {
  return ON_OFF_ONLY_KEYS.includes(key);
}

/**
 * Required defaults (exact):
 * - New events matching my interests = ON, Immediately
 * - Someone joins my event = ON, Immediately
 * - Someone leaves my event = ON, Immediately
 * - Post-event feedback reminders = ON (no frequency; triggers day after)
 * - 24-hour event reminders = ON (no frequency)
 * - Event canceled or changed = ON, Immediately
 * - Product updates = ON, Immediately
 */
export const DEFAULT_PREFS: Record<NotificationKey, NotificationPrefItem> = {
  event_match: { enabled: true, frequency: "immediately" },
  host_join: { enabled: true, frequency: "immediately" },
  host_leave: { enabled: true, frequency: "immediately" },
  feedback_requests: { enabled: true, frequency: "immediately" },
  event_reminders: { enabled: true, frequency: "immediately" },
  event_changed_canceled: { enabled: true, frequency: "immediately" },
  product_announcements: { enabled: true, frequency: "immediately" },
};

/** Allowed frequencies per key. On/off-only keys use a placeholder; frequency is ignored. */
export const ALLOWED_FREQUENCIES: Record<NotificationKey, readonly Frequency[]> = {
  event_match: ["immediately", "daily", "every_3_days", "weekly", "monthly", "never"],
  host_join: ["immediately", "daily", "every_3_days", "weekly", "never"],
  host_leave: ["immediately", "daily", "every_3_days", "weekly", "never"],
  feedback_requests: ["immediately"],
  event_reminders: ["immediately"],
  event_changed_canceled: ["immediately", "daily", "every_3_days", "weekly", "never"],
  product_announcements: ["immediately", "daily", "every_3_days", "weekly", "monthly", "never"],
};

export function isValidKey(key: string): key is NotificationKey {
  return VALID_KEYS.includes(key as NotificationKey);
}

export function isValidFrequency(freq: string, key: NotificationKey): freq is Frequency {
  return ALLOWED_FREQUENCIES[key].includes(freq as Frequency);
}

/**
 * Normalize notification prefs: merge stored data with defaults.
 * - If input missing/null/invalid: return full defaults
 * - If input partially missing: merge defaults for missing keys only
 * - If input has unknown keys: drop them
 * - For on/off-only keys: ignore frequency, keep only enabled
 */
export function normalizeNotificationPrefs(input?: unknown): NotificationPreferences {
  const items = (input && typeof input === "object" && (input as { items?: unknown }).items) as
    | Record<string, { enabled?: boolean; frequency?: string }>
    | undefined;
  const result: Record<string, NotificationPrefItem> = {};

  for (const key of VALID_KEYS) {
    const def = DEFAULT_PREFS[key];
    const incoming = items?.[key];
    if (incoming && typeof incoming === "object" && typeof incoming.enabled === "boolean") {
      if (isOnOffOnlyKey(key as NotificationKey)) {
        result[key] = { enabled: incoming.enabled, frequency: "immediately" };
      } else if (isValidFrequency(String(incoming.frequency ?? ""), key as NotificationKey)) {
        result[key] = {
          enabled: incoming.enabled,
          frequency: incoming.frequency as Frequency,
        };
      } else {
        result[key] = def;
      }
    } else {
      result[key] = def;
    }
  }
  return { version: 1, items: result };
}

/** Alias for backward compatibility */
export function mergeWithDefaults(raw: unknown): NotificationPreferences {
  return normalizeNotificationPrefs(raw);
}

export function validateAndMergeInput(body: unknown): NotificationPreferences | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as { prefs?: unknown };
  const prefs = raw.prefs;
  if (!prefs || typeof prefs !== "object") return null;
  const p = prefs as { version?: number; items?: unknown };
  if (p.version !== 1) return null;
  const items = p.items;
  if (!items || typeof items !== "object") return null;

  const result: Record<string, NotificationPrefItem> = {};
  const itemsObj = items as Record<string, unknown>;

  for (const key of Object.keys(itemsObj)) {
    if (!isValidKey(key)) continue;
    const typedKey = key as NotificationKey;
    const def = DEFAULT_PREFS[typedKey];
    const incoming = itemsObj[key];
    if (incoming && typeof incoming === "object" && typeof (incoming as { enabled?: boolean }).enabled === "boolean") {
      const enabled = (incoming as { enabled: boolean }).enabled;
      if (isOnOffOnlyKey(typedKey)) {
        result[key] = { enabled, frequency: "immediately" };
      } else {
        const freq = String((incoming as { frequency?: string }).frequency ?? "");
        if (isValidFrequency(freq, typedKey)) {
          result[key] = { enabled, frequency: freq as Frequency };
        } else {
          result[key] = def;
        }
      }
    } else {
      result[key] = def;
    }
  }

  for (const key of VALID_KEYS) {
    if (!(key in result)) result[key] = DEFAULT_PREFS[key];
  }

  return { version: 1, items: result };
}

/** Default prefs as JSON-serializable object for DB insertion */
export function getDefaultPrefsJson(): string {
  return JSON.stringify(normalizeNotificationPrefs(undefined));
}
