/**
 * Subject lines for every templated email. Keyed by template basename
 * (matches the .html / .txt files in templates/). Subjects use the same
 * Mustache syntax and TemplateModel as the body templates.
 *
 * `confirmationRequestUser` has two variants. The helper picks between
 * `_host` and `_attendee` based on the `isHost` flag.
 *
 * Source of truth at migration time: docs/Resend_Migration_Subjects.md.
 */
export const SUBJECTS = {
  // Auth & account
  verifyEmail: "Verify your NewChums email",
  passwordReset: "Reset your NewChums password",
  emailChangeConfirm: "Confirm your new NewChums email",
  emailChangeNotifyOld: "Your NewChums email is being changed",
  emailChangeSuccess: "Your NewChums email has been updated",
  magicLinkSignup: "Finish signing up for {{planTitle}}",
  planSignin: "Sign in to view {{planTitle}}",
  signinLink: "Your NewChums sign-in link",

  // Plan lifecycle (attendees / invitees)
  chumInvite: "{{inviterName}} invited you to NewChums",
  eventInvite: "{{hostName}} invited you to {{eventTitle}}",
  eventChanged: "Update to {{eventTitle}}",
  attendeeRemoved: "You've been removed from {{eventTitle}}",

  // Plan join requests
  joinRequestToHost: "{{requesterName}} wants to join {{eventTitle}}",
  joinRequestApproved: "You're in for {{eventTitle}}",
  joinRequestDeclined: "About your request to join {{eventTitle}}",

  // Plan chat
  chatMessageNotify: "{{senderName}} posted in {{eventTitle}}",

  // Host notifications
  eventJoin: "{{attendeeName}} is going to {{eventTitle}}",
  eventLeave: "{{attendeeName}} left {{eventTitle}}",
  eventMaybe: "{{attendeeName}} might come to {{eventTitle}}",

  // Attendance assurance / plan health
  confirmationRequestUser_attendee: "Are you still coming to {{eventTitle}}?",
  confirmationRequestUser_host: "Are you still hosting {{eventTitle}}?",
  rsvpReconfirmRequest: "New time for {{eventTitle}}. Can you still make it?",
  planAtRisk: "{{eventTitle}} needs more confirmations",
  planAutoCancelled: "{{eventTitle}} has been cancelled",
  planRemovedByAdmin: "Your plan {{eventTitle}} has been removed",
  planFeedback: "How did {{planTitle}} go?",

  // Digests
  unreadChatDigest: "You have unread messages on NewChums",
  eventMatchDigest: "{{planCount}} new {{planNoun}} you might like",

  // Communities
  communityJoinRequest: "{{requesterName}} wants to join {{communityName}}",
  communityJoinApproved: "Welcome to {{communityName}}",
  communityJoinDeclined: "About your {{communityName}} request",
  communityJoinRequestReopened: "You can request to join {{communityName}} again",
  communityMemberRemoved: "You've been removed from {{communityName}}",
  communityMemberUnblocked: "You can rejoin {{communityName}}",
  communityAnnouncement: "{{communityName}}: {{announcementTitle}}",

  // Admin & internal
  roadmapUpdate: "Update on your NewChums feedback",
  concernReportAlert: "New concern report submitted",
} as const;

export type SubjectKey = keyof typeof SUBJECTS;
