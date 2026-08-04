/**
 * Notification preferences: single source of truth for API.
 * Each preference is a simple on/off toggle. Supported emails send immediately.
 */

export type NotificationPrefItem = {
  enabled: boolean;
};

export type NotificationPreferences = {
  version: 1;
  items: Record<string, NotificationPrefItem>;
};

export const VALID_KEYS = [
  "event_match",
  "event_invite",
  "join_request_received",
  "join_request_accepted",
  "join_request_declined",
  "host_join",
  "host_maybe",
  "host_leave",
  "feedback_requests",
  "event_changed_canceled",
  "attendee_removed",
  "product_announcements",
  "unread_chat_digest",
  "attendance_confirmation",
  "roadmap_updates",
  "community_join_request_received",
  "community_join_request_result",
  "community_announcements",
  "direct_message",
  "run_it_again",
  "plan_reminder",
  "shoutout_received",
] as const;

export type NotificationKey = (typeof VALID_KEYS)[number];

export function isValidKey(key: string): key is NotificationKey {
  return VALID_KEYS.includes(key as NotificationKey);
}

export const DEFAULT_PREFS: Record<NotificationKey, NotificationPrefItem> = {
  event_match: { enabled: true },
  event_invite: { enabled: true },
  join_request_received: { enabled: true },
  join_request_accepted: { enabled: true },
  join_request_declined: { enabled: true },
  host_join: { enabled: true },
  host_maybe: { enabled: true },
  host_leave: { enabled: true },
  feedback_requests: { enabled: true },
  event_changed_canceled: { enabled: true },
  attendee_removed: { enabled: true },
  product_announcements: { enabled: true },
  unread_chat_digest: { enabled: true },
  attendance_confirmation: { enabled: true },
  roadmap_updates: { enabled: true },
  community_join_request_received: { enabled: true },
  community_join_request_result: { enabled: true },
  community_announcements: { enabled: true },
  direct_message: { enabled: true },
  run_it_again: { enabled: true },
  plan_reminder: { enabled: true },
  shoutout_received: { enabled: true },
};

/**
 * Normalize notification prefs: merge stored data with defaults.
 * - Missing/null/invalid input → full defaults
 * - Partially missing keys → defaults for missing keys only
 * - Unknown keys → dropped
 * - Legacy `frequency` fields → ignored (stripped)
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
      result[key] = { enabled: incoming.enabled };
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
    const incoming = itemsObj[key];
    if (incoming && typeof incoming === "object" && typeof (incoming as { enabled?: boolean }).enabled === "boolean") {
      result[typedKey] = { enabled: (incoming as { enabled: boolean }).enabled };
    } else {
      result[typedKey] = DEFAULT_PREFS[typedKey];
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
