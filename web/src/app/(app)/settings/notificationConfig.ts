/**
 * Notification preference config. Keys must match API allowlist.
 * Allowed frequencies are a subset per type. "Never" is represented by toggle OFF.
 */

export type NotificationFrequency = {
  value: string;
  label: string;
};

export type NotificationTypeConfig = {
  key: string;
  title: string;
  description: string;
  /** Empty = toggle only, no frequency dropdown (e.g. 24h reminder) */
  allowedFrequencies: NotificationFrequency[];
};

const FREQUENCY_OPTIONS: NotificationFrequency[] = [
  { value: "immediately", label: "Immediately" },
  { value: "daily", label: "Daily" },
  { value: "every_3_days", label: "Every 3 days" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const FREQ_IMMEDIATE_DAILY_WEEKLY_MONTHLY = FREQUENCY_OPTIONS.filter((f) =>
  ["immediately", "daily", "weekly", "monthly"].includes(f.value)
);

const FREQ_IMMEDIATE_MONTHLY = FREQUENCY_OPTIONS.filter((f) =>
  ["immediately", "monthly"].includes(f.value)
);

export const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    key: "event_match",
    title: "New events matching my interests",
    description: "Get notified when new events that match your interests and location are created.",
    allowedFrequencies: FREQUENCY_OPTIONS,
  },
  {
    key: "host_join",
    title: "Someone joins my event",
    description: "When someone joins an event you created.",
    allowedFrequencies: FREQUENCY_OPTIONS.filter((f) => f.value !== "monthly"),
  },
  {
    key: "host_leave",
    title: "Someone leaves my event",
    description: "When someone leaves one of your events.",
    allowedFrequencies: FREQUENCY_OPTIONS.filter((f) => f.value !== "monthly"),
  },
  {
    key: "feedback_requests",
    title: "Post-event feedback reminders",
    description: "Receive email reminders to provide feedback after you attend events.",
    allowedFrequencies: FREQ_IMMEDIATE_DAILY_WEEKLY_MONTHLY,
  },
  {
    key: "event_reminders",
    title: "24-hour event reminders",
    description: "Receive an email reminder 24 hours before events you're attending.",
    allowedFrequencies: [],
  },
  {
    key: "event_changed_canceled",
    title: "Event canceled or changed",
    description: "When an event you're attending is canceled or details change.",
    allowedFrequencies: FREQUENCY_OPTIONS.filter((f) => f.value !== "monthly"),
  },
  {
    key: "product_announcements",
    title: "Product updates",
    description: "Occasional news about NewChums features.",
    allowedFrequencies: FREQ_IMMEDIATE_MONTHLY,
  },
];
