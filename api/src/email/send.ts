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
    TrackLinks: "None",
    TrackOpens: false,
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
    TrackLinks: "None",
    TrackOpens: false,
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
    TrackLinks: "None",
    TrackOpens: false,
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
    TrackLinks: "None",
    TrackOpens: false,
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
    TrackLinks: "None",
    TrackOpens: false,
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
    TrackLinks: "None",
    TrackOpens: false,
  });

// ── Event email helpers ─────────────────────────────────────────────────
// These require Postmark templates to be created. If the template ID env var
// is not set, the send is silently skipped (noop). This lets the event system
// run without email infrastructure blocking core functionality.
//
// TEMPLATES TO CREATE IN POSTMARK:
//   1. Event Invite         , POSTMARK_TEMPLATE_EVENT_INVITE
//      Model: productName, recipientName, hostName, eventTitle, eventDate, eventUrl
//   2. Event Updated        , POSTMARK_TEMPLATE_EVENT_UPDATED
//      Model: productName, recipientName, eventTitle, changeDescription, eventUrl
//   3. Event Canceled       , POSTMARK_TEMPLATE_EVENT_CANCELED
//      Model: productName, recipientName, hostName, eventTitle, eventDate
//   4. Event Reminder       , POSTMARK_TEMPLATE_EVENT_REMINDER
//      Model: productName, recipientName, eventTitle, eventDate, eventLocation, eventUrl
//   5. RSVP Update to Host  , POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE
//      Model: productName, hostName, attendeeName, eventTitle, rsvpStatus, eventUrl

export const sendEventInviteEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, eventDate, eventLocation, eventUrl, inviteToken, unsubscribeUrl, suggestTimeNote, customMessage }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; eventDate: string; eventLocation?: string; eventUrl: string;
    inviteToken?: string; unsubscribeUrl?: string; suggestTimeNote?: string; customMessage?: string;
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
      suggestTimeNote: suggestTimeNote || null,
      customMessage: customMessage || null,
      year: new Date().getFullYear(),
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
//     {{variable}}        , top-level interpolation
//     {{#variable}}...{{/variable}}, show/hide blocks (no nested vars)
//     {{.}}               , self-reference inside a section (known to work)

export type PlanChangeItem = { fieldName: string; oldValue: string; newValue: string };

function formatChange(c: PlanChangeItem): string {
  return `${c.fieldName}: ${c.newValue} (previously was ${c.oldValue})`;
}

export const sendEventChangedEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventUrl, changeType, changes, eventDate, eventLocation, unsubscribeUrl }: {
    to: string; recipientName: string;
    eventTitle: string; eventUrl: string;
    changeType: "updated" | "locked" | "canceled";
    changes?: PlanChangeItem[];
    eventDate?: string; eventLocation?: string;
    unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_CHANGED) return;

  const headingMap = {
    canceled: "A plan has been cancelled",
    locked:   "A plan you're attending has been locked",
    updated:  "A plan you're attending has been updated",
  };
  const bodyMap = {
    canceled: `Hey ${recipientName}, we're sorry to let you know that a plan you were attending has been cancelled by the host. We hope to see you at the next one.`,
    locked:   `Hey ${recipientName}, the host has locked a plan you're attending. Your spot is confirmed -- no action needed. You can still view the plan details below.`,
    updated:  `Hey ${recipientName}, the host has made changes to a plan you're attending. Review the updates below.`,
  };
  const statusMap = {
    canceled: "Plan -- Cancelled",
    locked:   "Plan -- Locked",
    updated:  "Plan -- Updated",
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
      eventDate: eventDate || "",
      eventLocation: eventLocation || "",
      ctaUrl:      changeType === "canceled" ? "https://newchums.com" : eventUrl,
      ctaText:     ctaMap[changeType],
      change1: changes?.[0] ? formatChange(changes[0]) : "",
      change2: changes?.[1] ? formatChange(changes[1]) : "",
      change3: changes?.[2] ? formatChange(changes[2]) : "",
      change4: changes?.[3] ? formatChange(changes[3]) : "",
      change5: changes?.[4] ? formatChange(changes[4]) : "",
      hasChanges: changes && changes.length > 0 ? "1" : "",
      unsubscribeUrl: unsubscribeUrl || "",
      year: new Date().getFullYear(),
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
  eventDate?: string; eventLocation?: string;
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
      eventDate: params.eventDate || "", eventLocation: params.eventLocation || "",
      attendeeMessage: params.attendeeMessage || "",
      unsubscribeUrl: params.unsubscribeUrl || "",
      year: new Date().getFullYear(),
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
      eventDate: params.eventDate || "", eventLocation: params.eventLocation || "",
      attendeeMessage: params.attendeeMessage || "",
      unsubscribeUrl: params.unsubscribeUrl || "",
      year: new Date().getFullYear(),
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
      eventDate: params.eventDate || "", eventLocation: params.eventLocation || "",
      attendeeMessage: params.attendeeMessage || "",
      unsubscribeUrl: params.unsubscribeUrl || "",
      year: new Date().getFullYear(),
    },
  });
};

// ── Attendee removed notification ───────────────────────────────────────
//   You were removed from a plan, Postmark template 43923102
//   Model: productName, recipientName, hostName, eventTitle, eventUrl, removalReason

export const sendAttendeeRemovedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, eventUrl, eventDate, eventLocation, removalReason, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; eventUrl: string;
    eventDate?: string; eventLocation?: string;
    removalReason?: string | null; unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_ATTENDEE_REMOVED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_ATTENDEE_REMOVED,
    TemplateModel: {
      productName: "NewChums", recipientName, hostName, eventTitle, eventUrl,
      eventDate: eventDate || "", eventLocation: eventLocation || "",
      removalReason: removalReason || "", unsubscribeUrl: unsubscribeUrl || "",
      year: new Date().getFullYear(),
    },
  });
};

// ── Join-request email helpers ──────────────────────────────────────────
//   6. Join Request (to host)   , hardcoded template 43906440
//      Model: productName, hostName, requesterName, eventTitle, requestMessage, eventUrl
//   7. Join Request Approved    , hardcoded template 43906609
//      Model: productName, recipientName, hostName, eventTitle, hostMessage, eventUrl
//   8. Join Request Declined    , hardcoded template 43906703
//      Model: productName, recipientName, hostName, eventTitle, hostMessage, eventUrl

export const sendJoinRequestEmail = async (
  env: Bindings,
  { to, hostName, requesterName, eventTitle, requestMessage, eventUrl, eventDate, eventLocation, unsubscribeUrl }: {
    to: string; hostName: string; requesterName: string;
    eventTitle: string; requestMessage: string; eventUrl: string;
    eventDate?: string; eventLocation?: string; unsubscribeUrl?: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906440",
    TemplateModel: {
      productName: "NewChums", hostName, requesterName, eventTitle, requestMessage, eventUrl,
      eventDate: eventDate || "", eventLocation: eventLocation || "",
      unsubscribeUrl: unsubscribeUrl || "", year: new Date().getFullYear(),
    },
  });
};

export const sendJoinRequestApprovedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, hostMessage, eventUrl, eventDate, eventLocation, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; hostMessage: string | null; eventUrl: string;
    eventDate?: string; eventLocation?: string; unsubscribeUrl?: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906609",
    TemplateModel: {
      productName: "NewChums", recipientName, hostName, eventTitle, hostMessage, eventUrl,
      eventDate: eventDate || "", eventLocation: eventLocation || "",
      unsubscribeUrl: unsubscribeUrl || "", year: new Date().getFullYear(),
    },
  });
};

export const sendJoinRequestDeclinedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, hostMessage, eventUrl, eventDate, eventLocation, unsubscribeUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; hostMessage: string | null; eventUrl: string;
    eventDate?: string; eventLocation?: string; unsubscribeUrl?: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906703",
    TemplateModel: {
      productName: "NewChums", recipientName, hostName, eventTitle, hostMessage, eventUrl,
      eventDate: eventDate || "", eventLocation: eventLocation || "",
      unsubscribeUrl: unsubscribeUrl || "", year: new Date().getFullYear(),
    },
  });
};

// ── Unread chat digest email ────────────────────────────────────────────

export type DigestPlanItem = {
  title: string;
  unreadCount: number;
  url: string;
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FONT = "'Gabarito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function buildPlanCardHtml(title: string, unreadCount: number, url: string): string {
  const label = `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 10px; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden;">
  <tr><td style="background-color: #E65B13; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
  <tr><td style="padding: 16px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align: middle;">
          <p style="margin: 0 0 4px 0; font-family: ${FONT}; font-size: 16px; font-weight: 700; color: #1F2937; line-height: 1.3;">${escapeHtml(title)}</p>
          <p style="margin: 0; font-family: ${FONT}; font-size: 13px; color: #6B7280;">${label}</p>
        </td>
        <td style="vertical-align: middle; text-align: right; width: 80px;">
          <a href="${escapeHtml(url)}" style="display: inline-block; background-color: #E65B13; color: #ffffff; font-family: ${FONT}; font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 16px; border-radius: 6px; line-height: 1;">View</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
}

function buildPlanCardText(title: string, unreadCount: number, url: string): string {
  const label = `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`;
  return `- ${title} (${label})\n  ${url}`;
}

export const sendUnreadChatDigestEmail = async (
  env: Bindings,
  { to, recipientName, plans, unsubscribeUrl }: {
    to: string; recipientName: string;
    plans: DigestPlanItem[];
    unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST) return;

  const maxPlans = Math.min(plans.length, 5);
  const planCardsHtml = plans.slice(0, maxPlans).map((p) => buildPlanCardHtml(p.title, p.unreadCount, p.url)).join("\n");
  const planCardsText = plans.slice(0, maxPlans).map((p) => buildPlanCardText(p.title, p.unreadCount, p.url)).join("\n");

  const model: Record<string, string | number> = {
    productName: "NewChums",
    recipientName,
    planCount: plans.length,
    planCards: planCardsHtml,
    planCardsText,
    unsubscribeUrl: unsubscribeUrl || "",
  };

  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST,
    TemplateModel: model,
  });
};

// ── Event match digest email ────────────────────────────────────────────

export type EventMatchPlanItem = {
  title: string;
  description: string;
  date: string;
  location: string;
  /** Pre-rendered seat summary (aligned with plan detail capacity: going + reserved holds vs max_seats). */
  seatLine: string;
  url: string;
};

/** Matches plan detail / EventCard occupancy: going RSVPs plus reserved holds when reserve_seats is on. */
export function formatEventMatchSeatLine(params: {
  maxSeats: number | null | undefined;
  goingCount: number;
  reserveSeats: boolean;
  pendingInviteNoRsvpCount: number;
  maybeInviteeCount: number;
}): string {
  const maxRaw = params.maxSeats;
  const maxSeats = maxRaw != null && Number.isFinite(Number(maxRaw)) ? Math.floor(Number(maxRaw)) : null;
  if (maxSeats == null || maxSeats < 1) return "No seat limit";

  const going = Math.max(0, Math.floor(params.goingCount));
  const reserved = params.reserveSeats
    ? Math.max(0, Math.floor(params.pendingInviteNoRsvpCount)) + Math.max(0, Math.floor(params.maybeInviteeCount))
    : 0;
  const occupied = going + reserved;
  const remaining = maxSeats - occupied;
  if (remaining <= 0) return "This plan is full";
  return `${remaining} of ${maxSeats} seats remain`;
}

function buildMatchPlanCardHtml(plan: EventMatchPlanItem): string {
  const descSnippet = plan.description.length > 120
    ? escapeHtml(plan.description.slice(0, 117)) + "..."
    : escapeHtml(plan.description);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 10px; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden;">
  <tr><td style="background-color: #E65B13; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
  <tr><td style="padding: 16px 20px;">
    <p style="margin: 0 0 6px 0; font-family: ${FONT}; font-size: 16px; font-weight: 700; color: #1F2937; line-height: 1.3;">${escapeHtml(plan.title)}</p>${
    descSnippet ? `\n    <p style="margin: 0 0 8px 0; font-family: ${FONT}; font-size: 13px; color: #4B5563; line-height: 1.45;">${descSnippet}</p>` : ""
  }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align: top;">
          <p style="margin: 0 0 2px 0; font-family: ${FONT}; font-size: 13px; color: #6B7280;">&#128197;&ensp;${escapeHtml(plan.date)}</p>${
    plan.location ? `\n          <p style="margin: 0 0 2px 0; font-family: ${FONT}; font-size: 13px; color: #6B7280;">&#128205;&ensp;${escapeHtml(plan.location)}</p>` : ""
  }
          <p style="margin: 0; font-family: ${FONT}; font-size: 13px; color: #6B7280;">${escapeHtml(plan.seatLine)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding-top: 12px; vertical-align: top;">
          <a href="${escapeHtml(plan.url)}" style="display: inline-block; background-color: #E65B13; color: #ffffff; font-family: ${FONT}; font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 16px; border-radius: 6px; line-height: 1;">View Plan</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
}

function buildMatchPlanCardText(plan: EventMatchPlanItem): string {
  const descSnippet = plan.description.length > 120
    ? plan.description.slice(0, 117) + "..."
    : plan.description;
  const lines = [`- ${plan.title}`];
  if (descSnippet) lines.push(`  ${descSnippet}`);
  lines.push(`  Date: ${plan.date}`);
  if (plan.location) lines.push(`  Location: ${plan.location}`);
  lines.push(`  ${plan.seatLine}`);
  lines.push(`  ${plan.url}`);
  return lines.join("\n");
}

export const sendEventMatchDigestEmail = async (
  env: Bindings,
  { to, recipientName, plans, unsubscribeUrl }: {
    to: string; recipientName: string;
    plans: EventMatchPlanItem[];
    unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST) return;

  const maxPlans = Math.min(plans.length, 10);
  const displayed = plans.slice(0, maxPlans);
  const planCardsHtml = displayed.map((p) => buildMatchPlanCardHtml(p)).join("\n");
  const planCardsText = displayed.map((p) => buildMatchPlanCardText(p)).join("\n\n");

  const model: Record<string, string | number> = {
    productName: "NewChums",
    recipientName,
    planCount: plans.length,
    planNoun: plans.length === 1 ? "plan" : "plans",
    planCards: planCardsHtml,
    planCardsText,
    exploreUrl: `${env.WEB_BASE_URL}/`,
    unsubscribeUrl: unsubscribeUrl || "",
  };

  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST,
    TemplateModel: model,
  });
};

// ── Guest verification code email ────────────────────────────────────────

export const sendGuestVerifyCodeEmail = async (
  env: Bindings,
  { to, code, planTitle }: { to: string; code: string; planTitle: string },
) => {
  if (!env.POSTMARK_TEMPLATE_GUEST_VERIFY) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_GUEST_VERIFY,
    TemplateModel: {
      productName: "NewChums",
      code,
      planTitle,
    },
    TrackLinks: "None",
    TrackOpens: false,
  });
};

// ── Attendance assurance emails ─────────────────────────────────────────

export const sendConfirmationRequestEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventDate, eventLocation, eventUrl, ctaUrl, isHost, isReminder, isFinal, deadline, unsubscribeUrl }: {
    to: string; recipientName: string;
    eventTitle: string; eventDate: string; eventLocation?: string; eventUrl: string;
    ctaUrl: string;
    isHost: boolean; isReminder: boolean; isFinal: boolean;
    deadline: string; unsubscribeUrl?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_CONFIRMATION_REQUEST_USER) return;

  const stage: "initial" | "reminder" | "final" = isFinal ? "final" : isReminder ? "reminder" : "initial";

  const headingMap = {
    initial: isHost ? "Confirm you're still hosting" : "Confirm your attendance",
    reminder: isHost ? "Quick check: are you still hosting?" : "Quick check: are you still coming?",
    final: isHost ? "Last call: are you still hosting?" : "Last call: are you still coming?",
  } as const;

  const bodyAttendee = {
    initial: "Your plan is coming up soon. Please confirm whether you're still in so the host can plan ahead.",
    reminder: "Your plan is later today. Please let the host know whether you're still in so they can plan ahead.",
    final: "Your plan starts soon. Please respond now so the host knows who to expect.",
  } as const;
  const bodyHost = {
    initial: "Your plan is coming up soon. Please confirm you're still hosting so attendees know it's going ahead.",
    reminder: "Your plan is later today. Please confirm you're still hosting so attendees know it's going ahead.",
    final: "Your plan starts soon. Please confirm you're still hosting so attendees aren't left guessing.",
  } as const;

  // Button text ("View plan and confirm") is hard-coded directly in the
  // Postmark template HTML — no template variable needed. This matches the
  // pattern used by every other working email template and eliminates the
  // recurring empty-button bug caused by variable name drift between the
  // code and the Postmark hosted template.
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_CONFIRMATION_REQUEST_USER,
    TemplateModel: {
      productName: "NewChums",
      heading: headingMap[stage],
      greeting: `Hi ${recipientName},`,
      bodyText: isHost ? bodyHost[stage] : bodyAttendee[stage],
      recipientName,
      eventTitle,
      eventDate,
      eventLocation: eventLocation || "",
      eventUrl,
      ctaUrl,
      deadline,
      isReminder: isReminder || isFinal ? "1" : "",
      isFinal: isFinal ? "1" : "",
      unsubscribeUrl: unsubscribeUrl || "",
      year: new Date().getFullYear(),
    },
  });
};

export const sendGuestConfirmationRequestEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventDate, eventLocation, eventUrl, confirmUrl, declineUrl, viewUrl, isReminder, isFinal, deadline }: {
    to: string; recipientName: string;
    eventTitle: string; eventDate: string; eventLocation?: string; eventUrl: string;
    confirmUrl: string; declineUrl: string; viewUrl: string;
    isReminder: boolean; isFinal: boolean;
    deadline: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_CONFIRMATION_REQUEST_GUEST) return;

  const stage: "initial" | "reminder" | "final" = isFinal ? "final" : isReminder ? "reminder" : "initial";

  const headingMap = {
    initial: "Confirm your attendance",
    reminder: "Quick check: are you still coming?",
    final: "Last call: are you still coming?",
  } as const;

  const bodyMap = {
    initial: "Your plan is coming up soon. Please confirm whether you're still in so the host can plan ahead.",
    reminder: "Your plan is later today. Please let the host know whether you're still in so they can plan ahead.",
    final: "Your plan starts soon. Please respond now so the host knows who to expect.",
  } as const;

  // Button text ("I'm still coming" / "I can't make it") is hard-coded
  // directly in the Postmark template HTML — no template variables needed.
  // This eliminates the recurring empty-button bug caused by variable name
  // drift between the code and the Postmark hosted template.
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_CONFIRMATION_REQUEST_GUEST,
    TemplateModel: {
      productName: "NewChums",
      heading: headingMap[stage],
      greeting: `Hi ${recipientName},`,
      bodyText: bodyMap[stage],
      recipientName,
      eventTitle,
      eventDate,
      eventLocation: eventLocation || "",
      eventUrl,
      confirmUrl,
      declineUrl,
      viewUrl,
      deadline,
      isReminder: isReminder || isFinal ? "1" : "",
      isFinal: isFinal ? "1" : "",
      year: new Date().getFullYear(),
    },
  });
};

export const sendPlanAtRiskEmail = async (
  env: Bindings,
  { to, hostName, eventTitle, eventUrl, eventDate, eventLocation, confirmedCount, minRequired, unsubscribeUrl }: {
    to: string; hostName: string;
    eventTitle: string; eventUrl: string;
    eventDate?: string; eventLocation?: string;
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
      heading: `Attendance check: ${confirmedCount} of ${minRequired} confirmed`,
      bodyText: `Hey ${hostName}, your plan's 24-hour attendance check didn't reach the minimum of ${minRequired} confirmed. Only ${confirmedCount} confirmed so far. Please review and decide whether to proceed or cancel. If you do nothing, the plan will go ahead as scheduled.`,
      hostName,
      eventTitle,
      eventUrl,
      eventDate: eventDate || "",
      eventLocation: eventLocation || "",
      confirmedCount,
      minRequired,
      ctaUrl: eventUrl,
      ctaText: "Review and decide",
      unsubscribeUrl: unsubscribeUrl || "",
      year: new Date().getFullYear(),
    },
  });
};

export const sendPlanAutoCancelledEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, confirmedCount, minRequired, eventDate, eventLocation, unsubscribeUrl }: {
    to: string; recipientName: string;
    eventTitle: string;
    confirmedCount: number; minRequired: number;
    eventDate?: string; eventLocation?: string;
    unsubscribeUrl?: string;
  }
) => {
  // Use dedicated template if available, otherwise fall back to the generic eventChanged template
  if (env.POSTMARK_TEMPLATE_PLAN_AUTO_CANCELLED) {
    return sendPostmarkTemplateEmail(env, {
      From: env.EMAIL_FROM, To: to,
      TemplateId: env.POSTMARK_TEMPLATE_PLAN_AUTO_CANCELLED,
      TemplateModel: {
        productName: "NewChums",
        heading: "A plan you were attending has been cancelled",
        bodyText: `Hey ${recipientName}, unfortunately "${eventTitle}" didn't reach its minimum of ${minRequired} confirmed attendees -- only ${confirmedCount} confirmed -- so it's been automatically cancelled.`,
        eventTitle,
        eventDate: eventDate || "",
        eventLocation: eventLocation || "",
        reasonText: `Only ${confirmedCount} of ${minRequired} required attendees confirmed`,
        ctaUrl: "https://newchums.com",
        ctaText: "Browse other plans",
        unsubscribeUrl: unsubscribeUrl || "",
        year: new Date().getFullYear(),
      },
    });
  }
  // Fallback: use generic event-changed template
  if (!env.POSTMARK_TEMPLATE_EVENT_CHANGED) return;
  return sendEventChangedEmail(env, {
    to, recipientName, eventTitle,
    eventUrl: "https://newchums.com",
    changeType: "canceled",
    changes: [{ fieldName: "Reason", oldValue: `${confirmedCount} of ${minRequired} confirmed`, newValue: "Auto-cancelled -- minimum attendance not met" }],
    unsubscribeUrl,
  });
};

// ── Admin plan removal notification ─────────────────────────────────────
//   Postmark template 43998481.
//   Model: productName, hostName, eventTitle, reason

export const sendPlanRemovedByAdminEmail = async (
  env: Bindings,
  { to, hostName, eventTitle, reason }: {
    to: string; hostName: string;
    eventTitle: string; reason?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_PLAN_REMOVED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_PLAN_REMOVED,
    TemplateModel: {
      productName: "NewChums",
      hostName,
      eventTitle,
      reason: reason || "",
    },
  });
};

// ── Roadmap / feedback update notification ──────────────────────────────
//   Model: productName, recipientName, itemTitle, itemUrl, updateType,
//          statusLabel, adminNote, mergedIntoTitle, mergedIntoUrl, unsubscribeUrl

export const sendRoadmapUpdateEmail = async (
  env: Bindings,
  { to, recipientName, itemTitle, itemUrl, updateType, statusLabel, adminNote, mergedIntoTitle, mergedIntoUrl, unsubscribeUrl }: {
    to: string;
    recipientName: string;
    itemTitle: string;
    itemUrl: string;
    updateType: "status_change" | "merged";
    statusLabel?: string;
    adminNote?: string | null;
    mergedIntoTitle?: string;
    mergedIntoUrl?: string;
    unsubscribeUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_ROADMAP_UPDATE) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_ROADMAP_UPDATE,
    TemplateModel: {
      productName: "NewChums",
      recipientName,
      itemTitle,
      itemUrl,
      updateType,
      statusLabel: statusLabel ?? "",
      adminNote: adminNote ?? "",
      mergedIntoTitle: mergedIntoTitle ?? "",
      mergedIntoUrl: mergedIntoUrl ?? "",
      unsubscribeUrl,
    },
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
    Subject: `NewChums: Contact, ${params.subject}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    ReplyTo: params.email,
  });
};

export const sendPlanFeedbackEmail = async (
  env: Bindings,
  { to, recipientName, planTitle, planUrl, planDate, planLocation, unsubscribeUrl }: {
    to: string; recipientName: string;
    planTitle: string; planUrl: string;
    planDate?: string; planLocation?: string;
    unsubscribeUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_PLAN_FEEDBACK) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_PLAN_FEEDBACK,
    TemplateModel: {
      productName: "NewChums",
      heading: "How did your plan go?",
      greeting: `Hi ${recipientName},`,
      bodyText: `Your plan has wrapped up. Leaving a bit of feedback helps NewChums make better matches for you and keeps future plans more reliable.`,
      recipientName,
      planTitle,
      planUrl,
      planDate: planDate || "",
      planLocation: planLocation || "",
      ctaUrl: planUrl,
      ctaText: "Leave feedback",
      ctaHelperText: "Quick and private. Takes about a minute.",
      unsubscribeUrl,
      year: new Date().getFullYear(),
    },
  });
};

export const sendConcernReportAlert = async (
  env: Bindings,
  {
    reporterName,
    reporterEmail,
    reportedName,
    reportedEmail,
    planTitle,
    concernReason,
    details,
    submittedAt,
    reportUrl,
    reporterProfileUrl,
    reportedProfileUrl,
    planUrl,
  }: {
    reporterName: string;
    reporterEmail: string;
    reportedName: string;
    reportedEmail: string;
    planTitle: string;
    concernReason: string;
    details: string;
    submittedAt: string;
    reportUrl: string;
    reporterProfileUrl: string;
    reportedProfileUrl: string;
    planUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_CONCERN_REPORT) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: "contact@newchums.com",
    TemplateId: env.POSTMARK_TEMPLATE_CONCERN_REPORT,
    TemplateModel: {
      productName: "NewChums",
      reporterName,
      reporterEmail,
      reportedName,
      reportedEmail,
      planTitle,
      concernReason,
      details,
      submittedAt,
      reportUrl,
      reporterProfileUrl,
      reportedProfileUrl,
      planUrl,
    },
  });
};

// ── Community join request notifications ─────────────────────────────────

export const sendCommunityJoinRequestEmail = async (
  env: Bindings,
  { to, ownerName, requesterName, communityName, communityUrl }: {
    to: string; ownerName: string; requesterName: string; communityName: string; communityUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST,
    TemplateModel: { productName: "NewChums", ownerName, requesterName, communityName, communityUrl },
  });
};

export const sendCommunityJoinApprovedEmail = async (
  env: Bindings,
  { to, userName, communityName, communityUrl }: {
    to: string; userName: string; communityName: string; communityUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED,
    TemplateModel: { productName: "NewChums", userName, communityName, communityUrl },
  });
};

export const sendCommunityJoinDeclinedEmail = async (
  env: Bindings,
  { to, userName, communityName }: {
    to: string; userName: string; communityName: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED,
    TemplateModel: { productName: "NewChums", userName, communityName },
  });
};
