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

const VALID_KEYS = [
  "event_match",
  "host_join",
  "host_leave",
  "feedback_requests",
  "event_reminders",
  "event_changed_canceled",
  "product_announcements",
] as const;

export type NotificationKey = (typeof VALID_KEYS)[number];

export const DEFAULT_PREFS: Record<NotificationKey, NotificationPrefItem> = {
  event_match: { enabled: true, frequency: "daily" },
  host_join: { enabled: true, frequency: "immediately" },
  host_leave: { enabled: true, frequency: "immediately" },
  feedback_requests: { enabled: true, frequency: "weekly" },
  event_reminders: { enabled: true, frequency: "daily" },
  event_changed_canceled: { enabled: true, frequency: "immediately" },
  product_announcements: { enabled: false, frequency: "monthly" },
};

/** Allowed frequencies per key (subset of global set) */
export const ALLOWED_FREQUENCIES: Record<NotificationKey, readonly Frequency[]> = {
  event_match: ["immediately", "daily", "every_3_days", "weekly", "monthly", "never"],
  host_join: ["immediately", "daily", "every_3_days", "weekly", "never"],
  host_leave: ["immediately", "daily", "every_3_days", "weekly", "never"],
  feedback_requests: ["immediately", "daily", "every_3_days", "weekly", "never"],
  event_reminders: ["immediately", "daily", "every_3_days", "weekly", "never"],
  event_changed_canceled: ["immediately", "daily", "every_3_days", "weekly", "never"],
  product_announcements: ["immediately", "daily", "every_3_days", "weekly", "monthly", "never"],
};

export function isValidKey(key: string): key is NotificationKey {
  return VALID_KEYS.includes(key as NotificationKey);
}

export function isValidFrequency(freq: string, key: NotificationKey): freq is Frequency {
  return ALLOWED_FREQUENCIES[key].includes(freq as Frequency);
}

export function mergeWithDefaults(raw: unknown): NotificationPreferences {
  const items = (raw && typeof raw === "object" && (raw as { items?: unknown }).items) as
    | Record<string, { enabled?: boolean; frequency?: string }>
    | undefined;
  const result: Record<string, NotificationPrefItem> = {};

  for (const key of VALID_KEYS) {
    const def = DEFAULT_PREFS[key];
    const incoming = items?.[key];
    if (
      incoming &&
      typeof incoming === "object" &&
      typeof incoming.enabled === "boolean" &&
      isValidFrequency(String(incoming.frequency ?? ""), key)
    ) {
      result[key] = {
        enabled: incoming.enabled,
        frequency: incoming.frequency as Frequency,
      };
    } else {
      result[key] = def;
    }
  }
  return { version: 1, items: result };
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
    const def = DEFAULT_PREFS[key];
    const incoming = itemsObj[key];
    if (
      incoming &&
      typeof incoming === "object" &&
      typeof (incoming as { enabled?: boolean }).enabled === "boolean" &&
      isValidFrequency(String((incoming as { frequency?: string }).frequency ?? ""), key)
    ) {
      result[key] = {
        enabled: (incoming as { enabled: boolean }).enabled,
        frequency: (incoming as { frequency: string }).frequency as Frequency,
      };
    } else {
      result[key] = def;
    }
  }

  for (const key of VALID_KEYS) {
    if (!(key in result)) result[key] = DEFAULT_PREFS[key];
  }

  return { version: 1, items: result };
}
