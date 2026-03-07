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

const FREQ_IMMEDIATE_MONTHLY = FREQUENCY_OPTIONS.filter((f) =>
  ["immediately", "monthly"].includes(f.value)
);

export const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    key: "event_match",
    title: "New plans matching my interests",
    description: "Get notified when plans that match your hobbies and location are created nearby.",
    allowedFrequencies: FREQUENCY_OPTIONS,
  },
  {
    key: "host_join",
    title: "Someone joins your plan",
    description: "When someone signs up for a plan you're hosting.",
    allowedFrequencies: FREQUENCY_OPTIONS.filter((f) => f.value !== "monthly"),
  },
  {
    key: "host_leave",
    title: "Someone leaves your plan",
    description: "When someone can no longer make it to a plan you're hosting.",
    allowedFrequencies: FREQUENCY_OPTIONS.filter((f) => f.value !== "monthly"),
  },
  {
    key: "feedback_requests",
    title: "Post-gathering feedback",
    description: "A quick follow-up the day after gatherings you attend.",
    allowedFrequencies: [],
  },
  {
    key: "event_reminders",
    title: "24-hour reminders",
    description: "A reminder 24 hours before plans you're attending.",
    allowedFrequencies: [],
  },
  {
    key: "event_changed_canceled",
    title: "Plan canceled or changed",
    description: "When a plan you're attending is canceled or details change.",
    allowedFrequencies: FREQUENCY_OPTIONS.filter((f) => f.value !== "monthly"),
  },
  {
    key: "product_announcements",
    title: "Product updates",
    description: "Occasional news about NewChums features and improvements.",
    allowedFrequencies: FREQ_IMMEDIATE_MONTHLY,
  },
];
