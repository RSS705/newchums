import type { Bindings } from "../db";
import { sendPostmarkRawEmail, sendPostmarkTemplateEmail } from "./postmark";
import {
  renderContactSubmissionHtml,
  renderContactSubmissionText,
} from "./templates/contactSubmission";

type EmailPayloadBase = {
  to: string;
  name?: string;
};

export const sendVerificationEmail = async (
  env: Bindings,
  { to, name, verifyUrl }: EmailPayloadBase & { verifyUrl: string }
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_VERIFY,
    TemplateModel: {
      productName: "NewChums",
      name: name ?? "there",
      verifyUrl,
    },
  });

export const sendPasswordResetEmail = async (
  env: Bindings,
  { to, name, resetUrl }: EmailPayloadBase & { resetUrl: string }
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_RESET,
    TemplateModel: {
      productName: "NewChums",
      name: name ?? "there",
      resetUrl,
    },
  });

export const sendEmailChangeConfirmEmail = async (
  env: Bindings,
  { to, name, confirmUrl }: EmailPayloadBase & { confirmUrl: string }
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EMAIL_CHANGE_CONFIRM,
    TemplateModel: {
      productName: "NewChums",
      name: name ?? "there",
      confirmUrl,
    },
  });

export const sendEmailChangeNotifyOldEmail = async (
  env: Bindings,
  { to, name, newEmail }: EmailPayloadBase & { newEmail: string }
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EMAIL_CHANGE_NOTIFY_OLD,
    TemplateModel: {
      productName: "NewChums",
      name: name ?? "there",
      newEmail,
    },
  });

export const sendEmailChangeSuccessEmail = async (
  env: Bindings,
  { to, name }: EmailPayloadBase
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EMAIL_CHANGE_SUCCESS,
    TemplateModel: {
      productName: "NewChums",
      name: name ?? "there",
    },
  });

export const sendRsvpConfirmationEmail = async (
  env: Bindings,
  {
    to,
    name,
    eventTitle,
    eventStartsAtISO,
    eventLocation,
    eventUrl,
  }: EmailPayloadBase & {
    eventTitle: string;
    eventStartsAtISO: string;
    eventLocation?: string;
    eventUrl: string;
  }
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_RSVP,
    TemplateModel: {
      productName: "NewChums",
      name: name ?? "there",
      eventTitle,
      eventStartsAt: eventStartsAtISO,
      eventLocation: eventLocation ?? "",
    eventUrl,
  },
  });

export const sendChumInviteEmail = async (
  env: Bindings,
  {
    to,
    inviterName,
    inviteUrl,
  }: { to: string; inviterName: string; inviteUrl: string }
) =>
  sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: "43805532",
    TemplateModel: {
      productName: "NewChums",
      inviterName,
      inviteUrl,
    },
  });

// ── Event email helpers ─────────────────────────────────────────────────
// These require Postmark templates to be created. If the template ID env var
// is not set, the send is silently skipped (noop). This lets the event system
// run without email infrastructure blocking core functionality.
//
// TEMPLATES TO CREATE IN POSTMARK:
//   1. Event Invite          — POSTMARK_TEMPLATE_EVENT_INVITE
//      Model: productName, recipientName, hostName, eventTitle, eventDate, eventUrl
//   2. Event Updated         — POSTMARK_TEMPLATE_EVENT_UPDATED
//      Model: productName, recipientName, eventTitle, changeDescription, eventUrl
//   3. Event Canceled        — POSTMARK_TEMPLATE_EVENT_CANCELED
//      Model: productName, recipientName, hostName, eventTitle, eventDate
//   4. Event Reminder        — POSTMARK_TEMPLATE_EVENT_REMINDER
//      Model: productName, recipientName, eventTitle, eventDate, eventLocation, eventUrl
//   5. RSVP Update to Host   — POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE
//      Model: productName, hostName, attendeeName, eventTitle, rsvpStatus, eventUrl

export const sendEventInviteEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, eventDate, eventLocation, eventUrl, inviteToken, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; eventDate: string; eventLocation?: string; eventUrl: string;
    inviteToken?: string; unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_INVITE) return;
  const tokenParam = inviteToken ? `&invite_token=${encodeURIComponent(inviteToken)}` : "";
  const goingUrl = `${eventUrl}?rsvp=going${tokenParam}`;
  const maybeUrl = `${eventUrl}?rsvp=maybe${tokenParam}`;
  const cantMakeItUrl = `${eventUrl}?rsvp=cant_make_it${tokenParam}`;
  const viewUrl = inviteToken ? `${eventUrl}?invite_token=${encodeURIComponent(inviteToken)}` : eventUrl;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_INVITE,
    TemplateModel: {
      productName: "NewChums", recipientName, hostName, eventTitle, eventDate,
      eventLocation: eventLocation || "",
      eventUrl: viewUrl, goingUrl, maybeUrl, cantMakeItUrl,
      unsubscribeUrl: unsubscribeUrl || "",
    },
  });
};

export const sendEventUpdatedEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, changeDescription, eventUrl }: {
    to: string; recipientName: string;
    eventTitle: string; changeDescription: string; eventUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_UPDATED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_UPDATED,
    TemplateModel: { productName: "NewChums", recipientName, eventTitle, changeDescription, eventUrl },
  });
};

// ── Plan-changed notification ────────────────────────────────────────────
//   Covers three host actions: plan edited, plan locked, plan cancelled.
//   Template 43971187.
//
//   Postmark's Mustachio doesn't resolve parent-context variables inside
//   string-value {{#section}} blocks. So ALL dynamic content is pre-rendered
//   into flat top-level variables. The template uses only:
//     {{variable}}         — top-level interpolation
//     {{#variable}}...{{/variable}} — show/hide blocks (no nested vars)
//     {{.}}                — self-reference inside a section (known to work)

export type PlanChangeItem = { fieldName: string; oldValue: string; newValue: string };

function formatChange(c: PlanChangeItem): string {
  return `${c.fieldName}: ${c.newValue} (previously was ${c.oldValue})`;
}

export const sendEventChangedEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventUrl, changeType, changes, unsubscribeUrl }: {
    to: string; recipientName: string;
    eventTitle: string; eventUrl: string;
    changeType: "updated" | "locked" | "canceled";
    changes?: PlanChangeItem[];
    unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_CHANGED) return;

  const headingMap = {
    canceled: "A plan has been cancelled",
    locked:   "A plan you\u2019re attending has been locked",
    updated:  "A plan you\u2019re attending has been updated",
  };
  const bodyMap = {
    canceled: `Hey ${recipientName}, we\u2019re sorry to let you know that a plan you were attending has been cancelled by the host. We hope to see you at the next one.`,
    locked:   `Hey ${recipientName}, the host has locked a plan you\u2019re attending. Your spot is confirmed \u2014 no action needed. You can still view the plan details below.`,
    updated:  `Hey ${recipientName}, the host has made changes to a plan you\u2019re attending. Review the updates below.`,
  };
  const statusMap = {
    canceled: "Plan \u2014 Cancelled",
    locked:   "Plan \u2014 Locked",
    updated:  "Plan \u2014 Updated",
  };
  const ctaMap = {
    canceled: "Explore other plans",
    locked:   "View plan",
    updated:  "View updated plan",
  };

  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_CHANGED,
    TemplateModel: {
      productName: "NewChums",
      heading:     headingMap[changeType],
      bodyText:    bodyMap[changeType],
      statusLabel: statusMap[changeType],
      statusColor: changeType === "canceled" ? "#6B7280" : "#E65B13",
      eventTitle,
      ctaUrl:      changeType === "canceled" ? "https://newchums.com" : eventUrl,
      ctaText:     ctaMap[changeType],
      change1: changes?.[0] ? formatChange(changes[0]) : "",
      change2: changes?.[1] ? formatChange(changes[1]) : "",
      change3: changes?.[2] ? formatChange(changes[2]) : "",
      change4: changes?.[3] ? formatChange(changes[3]) : "",
      change5: changes?.[4] ? formatChange(changes[4]) : "",
      hasChanges: changes && changes.length > 0 ? "1" : "",
      unsubscribeUrl: unsubscribeUrl || "",
    },
  });
};

export const sendEventCanceledEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, eventDate }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; eventDate: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_CANCELED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_CANCELED,
    TemplateModel: { productName: "NewChums", recipientName, hostName, eventTitle, eventDate },
  });
};

export const sendEventReminderEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventDate, eventLocation, eventUrl }: {
    to: string; recipientName: string;
    eventTitle: string; eventDate: string; eventLocation: string; eventUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_REMINDER) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_REMINDER,
    TemplateModel: { productName: "NewChums", recipientName, eventTitle, eventDate, eventLocation, eventUrl },
  });
};

export const sendEventRsvpUpdateEmail = async (
  env: Bindings,
  { to, hostName, attendeeName, eventTitle, rsvpStatus, eventUrl }: {
    to: string; hostName: string; attendeeName: string;
    eventTitle: string; rsvpStatus: string; eventUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE,
    TemplateModel: { productName: "NewChums", hostName, attendeeName, eventTitle, rsvpStatus, eventUrl },
  });
};

// ── Host RSVP notification helpers ──────────────────────────────────────
//   Each RSVP status has its own Postmark template and preference toggle.
//   Model: productName, hostName, attendeeName, eventTitle, eventUrl, attendeeMessage

type HostRsvpEmailParams = {
  to: string; hostName: string; attendeeName: string;
  eventTitle: string; eventUrl: string; attendeeMessage?: string | null;
  unsubscribeUrl?: string;
};

export const sendEventJoinEmail = async (
  env: Bindings, params: HostRsvpEmailParams
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_JOIN) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: params.to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_JOIN,
    TemplateModel: {
      productName: "NewChums", hostName: params.hostName, attendeeName: params.attendeeName,
      eventTitle: params.eventTitle, eventUrl: params.eventUrl,
      attendeeMessage: params.attendeeMessage || "",
      unsubscribeUrl: params.unsubscribeUrl || "",
    },
  });
};

export const sendEventLeaveEmail = async (
  env: Bindings, params: HostRsvpEmailParams
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_LEAVE) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: params.to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_LEAVE,
    TemplateModel: {
      productName: "NewChums", hostName: params.hostName, attendeeName: params.attendeeName,
      eventTitle: params.eventTitle, eventUrl: params.eventUrl,
      attendeeMessage: params.attendeeMessage || "",
      unsubscribeUrl: params.unsubscribeUrl || "",
    },
  });
};

export const sendEventMaybeEmail = async (
  env: Bindings, params: HostRsvpEmailParams
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_MAYBE) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: params.to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_MAYBE,
    TemplateModel: {
      productName: "NewChums", hostName: params.hostName, attendeeName: params.attendeeName,
      eventTitle: params.eventTitle, eventUrl: params.eventUrl,
      attendeeMessage: params.attendeeMessage || "",
      unsubscribeUrl: params.unsubscribeUrl || "",
    },
  });
};

// ── Attendee removed notification ───────────────────────────────────────
//   You were removed from a plan — Postmark template 43923102
//   Model: productName, recipientName, hostName, eventTitle, eventUrl, removalReason

export const sendAttendeeRemovedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, eventUrl, removalReason, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; eventUrl: string; removalReason?: string | null; unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_ATTENDEE_REMOVED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_ATTENDEE_REMOVED,
    TemplateModel: { productName: "NewChums", recipientName, hostName, eventTitle, eventUrl, removalReason: removalReason || "", unsubscribeUrl: unsubscribeUrl || "" },
  });
};

// ── Join-request email helpers ──────────────────────────────────────────
//   6. Join Request (to host)    — hardcoded template 43906440
//      Model: productName, hostName, requesterName, eventTitle, requestMessage, eventUrl
//   7. Join Request Approved     — hardcoded template 43906609
//      Model: productName, recipientName, hostName, eventTitle, hostMessage, eventUrl
//   8. Join Request Declined     — hardcoded template 43906703
//      Model: productName, recipientName, hostName, eventTitle, hostMessage, eventUrl

export const sendJoinRequestEmail = async (
  env: Bindings,
  { to, hostName, requesterName, eventTitle, requestMessage, eventUrl, unsubscribeUrl }: {
    to: string; hostName: string; requesterName: string;
    eventTitle: string; requestMessage: string; eventUrl: string; unsubscribeUrl?: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906440",
    TemplateModel: { productName: "NewChums", hostName, requesterName, eventTitle, requestMessage, eventUrl, unsubscribeUrl: unsubscribeUrl || "" },
  });
};

export const sendJoinRequestApprovedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, hostMessage, eventUrl, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; hostMessage: string; eventUrl: string; unsubscribeUrl?: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906609",
    TemplateModel: { productName: "NewChums", recipientName, hostName, eventTitle, hostMessage, eventUrl, unsubscribeUrl: unsubscribeUrl || "" },
  });
};

export const sendJoinRequestDeclinedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, hostMessage, eventUrl, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; hostMessage: string; eventUrl: string; unsubscribeUrl?: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906703",
    TemplateModel: { productName: "NewChums", recipientName, hostName, eventTitle, hostMessage, eventUrl, unsubscribeUrl: unsubscribeUrl || "" },
  });
};

// ── Unread chat digest email ────────────────────────────────────────────

export type DigestPlanItem = {
  title: string;
  unreadCount: number;
  url: string;
};

export const sendUnreadChatDigestEmail = async (
  env: Bindings,
  { to, recipientName, plans, unsubscribeUrl }: {
    to: string; recipientName: string;
    plans: DigestPlanItem[];
    unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST) return;

  // Flatten plans into top-level variables (Postmark Mustachio lacks array iteration)
  const model: Record<string, string | number> = {
    productName: "NewChums",
    recipientName,
    planCount: plans.length,
    unsubscribeUrl: unsubscribeUrl || "",
  };
  const maxPlans = Math.min(plans.length, 10);
  for (let i = 0; i < maxPlans; i++) {
    const p = plans[i];
    model[`plan${i + 1}Title`] = p.title;
    model[`plan${i + 1}Count`] = p.unreadCount;
    model[`plan${i + 1}Url`] = p.url;
    model[`plan${i + 1}Label`] = `${p.unreadCount} unread ${p.unreadCount === 1 ? "message" : "messages"}`;
  }

  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST,
    TemplateModel: model,
  });
};

// ── Attendance assurance emails ─────────────────────────────────────────

export const sendConfirmationRequestEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventDate, eventLocation, eventUrl, confirmUrl, declineUrl, isHost, isReminder, isFinal, deadline, unsubscribeUrl }: {
    to: string; recipientName: string;
    eventTitle: string; eventDate: string; eventLocation?: string; eventUrl: string;
    confirmUrl: string; declineUrl: string;
    isHost: boolean; isReminder: boolean; isFinal: boolean;
    deadline: string; unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_CONFIRMATION_REQUEST) return;

  const headingMap = {
    initial: isHost ? "Confirm you\u2019re still hosting" : "Confirm your attendance",
    reminder: isHost ? "Reminder: Confirm you\u2019re still hosting" : "Reminder: Confirm your attendance",
    final: isHost ? "Final reminder: Confirm you\u2019re hosting" : "Final reminder: Confirm your attendance",
  };
  const stage = isFinal ? "final" : isReminder ? "reminder" : "initial";

  const bodyHost = `Hey ${recipientName}, your plan is coming up and requires final confirmation. Please confirm you\u2019re still hosting so attendees know the plan is on.`;
  const bodyAttendee = `Hey ${recipientName}, a plan you\u2019re attending requires final confirmation. Please confirm you\u2019re still coming so the host can plan ahead.`;

  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_CONFIRMATION_REQUEST,
    TemplateModel: {
      productName: "NewChums",
      heading: headingMap[stage],
      bodyText: isHost ? bodyHost : bodyAttendee,
      recipientName,
      eventTitle,
      eventDate,
      eventLocation: eventLocation || "",
      eventUrl,
      confirmUrl,
      declineUrl,
      confirmLabel: isHost ? "I\u2019m still hosting" : "I\u2019m still coming",
      declineLabel: isHost ? "Cancel this plan" : "I can\u2019t make it",
      deadline,
      isReminder: isReminder || isFinal ? "1" : "",
      isFinal: isFinal ? "1" : "",
      unsubscribeUrl: unsubscribeUrl || "",
    },
  });
};

export const sendPlanAtRiskEmail = async (
  env: Bindings,
  { to, hostName, eventTitle, eventUrl, confirmedCount, minRequired, unsubscribeUrl }: {
    to: string; hostName: string;
    eventTitle: string; eventUrl: string;
    confirmedCount: number; minRequired: number;
    unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_PLAN_AT_RISK) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_PLAN_AT_RISK,
    TemplateModel: {
      productName: "NewChums",
      heading: "Your plan may be at risk",
      bodyText: `Hey ${hostName}, your plan hasn\u2019t reached the minimum confirmed attendance. ${confirmedCount} of ${minRequired} required attendees have confirmed. You can review the plan and decide whether to proceed or cancel.`,
      hostName,
      eventTitle,
      eventUrl,
      confirmedCount,
      minRequired,
      ctaUrl: eventUrl,
      ctaText: "Review plan",
      unsubscribeUrl: unsubscribeUrl || "",
    },
  });
};

export const sendPlanAutoCancelledEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, confirmedCount, minRequired }: {
    to: string; recipientName: string;
    eventTitle: string;
    confirmedCount: number; minRequired: number;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_CHANGED) return;
  return sendEventChangedEmail(env, {
    to,
    recipientName,
    eventTitle,
    eventUrl: "https://newchums.com",
    changeType: "canceled",
    changes: [{ fieldName: "Reason", oldValue: `${confirmedCount} of ${minRequired} confirmed`, newValue: "Auto-cancelled \u2014 minimum attendance not met" }],
  });
};

const CONTACT_EMAIL = "contact@newchums.com";

export const sendContactFormEmail = async (
  env: Bindings,
  params: {
    name: string;
    email: string;
    subject: string;
    message: string;
    requestIp: string | null;
    userId?: string;
    username?: string;
  }
) => {
  const timestamp = new Date().toISOString();
  const templateParams = {
    name: params.name,
    email: params.email,
    subject: params.subject,
    message: params.message,
    requestIp: params.requestIp,
    timestamp,
    userId: params.userId,
    username: params.username,
    environment: env.APP_ENV === "production" ? "Prod" : env.APP_ENV === "development" ? "Local" : env.APP_ENV ?? "Unknown",
  };

  const htmlBody = renderContactSubmissionHtml(templateParams);
  const textBody = renderContactSubmissionText(templateParams);

  await sendPostmarkRawEmail(env, {
    From: CONTACT_EMAIL,
    To: CONTACT_EMAIL,
    Subject: `NewChums: Contact — ${params.subject}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    ReplyTo: params.email,
  });
};
