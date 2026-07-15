/**
 * Subject lines for every templated email. Keyed by template basename
 * (matches the .html / .txt files in templates/). Subjects use the same
 * Mustache syntax and TemplateModel as the body templates.
 *
 * Some templates have subject variants (suffixed keys picked via the
 * dispatch `subjectKey` option): `confirmationRequestUser` picks between
 * `_host` and `_attendee` based on the `isHost` flag, and the three host
 * RSVP emails pick a change-of-response variant (`eventJoin_nowGoing`,
 * `eventLeave_declined`, `eventMaybe_wasGoing`) from the attendee's
 * previous status.
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

  // Host notifications. The three RSVP emails are previous-status aware:
  // the base key covers a first response, the suffixed variants cover a
  // change of response (picked via the dispatch subjectKey option).
  eventJoin: "{{attendeeName}} is going to {{eventTitle}}",
  eventJoin_nowGoing: "{{attendeeName}} is now going to {{eventTitle}}",
  eventLeave: "{{attendeeName}} left {{eventTitle}}",
  eventLeave_declined: "{{attendeeName}} can't make it to {{eventTitle}}",
  eventMaybe: "{{attendeeName}} might come to {{eventTitle}}",
  eventMaybe_wasGoing: "{{attendeeName}} is now a maybe for {{eventTitle}}",

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
