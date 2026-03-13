/**
 * Notification preference config. Keys must match API allowlist.
 * Each notification type is a simple on/off toggle.
 */

export type NotificationTypeConfig = {
  key: string;
  title: string;
  description: string;
};

export const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    key: "event_match",
    title: "New plans matching my interests",
    description: "Get notified when plans that match your hobbies and location are created nearby.",
  },
  {
    key: "host_join",
    title: "Someone joins your plan",
    description: "When someone signs up for a plan you're hosting.",
  },
  {
    key: "host_leave",
    title: "Someone leaves your plan",
    description: "When someone can no longer make it to a plan you're hosting.",
  },
  {
    key: "feedback_requests",
    title: "Post-gathering feedback",
    description: "A quick follow-up the day after gatherings you attend.",
  },
  {
    key: "event_changed_canceled",
    title: "Plan canceled or changed",
    description: "When a plan you're attending is canceled or details change.",
  },
  {
    key: "product_announcements",
    title: "Product updates",
    description: "Occasional news about NewChums features and improvements.",
  },
];
