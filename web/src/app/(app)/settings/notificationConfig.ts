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
    description:
      "Get notified when in-person plans match your hobbies and location (public plans, or Chums-only plans from hosts who have you in their connections).",
  },
  {
    key: "event_invite",
    title: "Someone invited you to a plan",
    description: "When someone invites you to join a plan.",
  },
  {
    key: "join_request_received",
    title: "Someone requested to join your plan",
    description: "When someone requests to join a plan you're hosting that requires approval.",
  },
  {
    key: "join_request_accepted",
    title: "Your join request was accepted",
    description: "When a host approves your request to join their plan.",
  },
  {
    key: "join_request_declined",
    title: "Your join request was declined",
    description: "When a host declines your request to join their plan.",
  },
  {
    key: "host_join",
    title: "Someone is going to your plan",
    description: "When someone confirms they're attending a plan you're hosting.",
  },
  {
    key: "host_maybe",
    title: "Someone might attend your plan",
    description: "When someone RSVPs as \"maybe\" to a plan you're hosting.",
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
    key: "attendee_removed",
    title: "You were removed from a plan",
    description: "When a host removes you from a plan you were attending.",
  },
  {
    key: "product_announcements",
    title: "Product updates",
    description: "Occasional news about NewChums features and improvements.",
  },
  {
    key: "unread_chat_digest",
    title: "Unread messages in your plans",
    description: "A daily email when you have unread chat messages in plans you\u2019re part of.",
  },
  {
    key: "attendance_confirmation",
    title: "Attendance confirmation reminders",
    description: "Reminders to confirm your attendance before plans that require it.",
  },
  {
    key: "roadmap_updates",
    title: "Roadmap updates",
    description: "Updates on roadmap items you\u2019ve submitted or followed.",
  },
];
