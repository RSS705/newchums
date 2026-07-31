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
    key: "direct_message",
    title: "Someone sends you a message",
    description:
      "When someone messages your Inbox. At most one email per conversation until you've read it, so a back-and-forth never floods your email.",
  },
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
    title: "Someone can't make it to your plan",
    description: "When someone lets you know they can't make it to a plan you're hosting, or leaves after joining.",
  },
  {
    // Key is stored in user_profile.notification_prefs JSON; renaming it
    // would silently reset every user's saved choice, so only the display
    // strings changed when the post-plan surface became the wrap-up.
    key: "feedback_requests",
    title: "Post-plan follow-up",
    description: "After a plan wraps up: a nudge to thank people, and a private check-in for plans you host.",
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
    title: "Plan chat notifications",
    description: "An email when someone posts in a plan's chat and chooses to notify attendees. Plain messages won't email you.",
  },
  {
    key: "attendance_confirmation",
    title: "Attendance confirmation reminders",
    description: "Reminders to confirm your attendance before plans that require it.",
  },
  {
    key: "roadmap_updates",
    title: "Roadmap updates",
    description: "Updates on roadmap items you've submitted or followed.",
  },
  {
    key: "community_join_request_received",
    title: "Someone requested to join your community",
    description: "When someone requests to join a private community you own.",
  },
  {
    key: "community_join_request_result",
    title: "Your community join request was reviewed",
    description: "When a community owner approves or declines your request to join.",
  },
  {
    key: "community_announcements",
    title: "Community announcements",
    description: "Get emailed when communities you belong to post announcements.",
  },
];
