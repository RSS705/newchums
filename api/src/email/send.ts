import type { Bindings } from "../db";
import { sendResendEmail } from "./resend";
import { renderEmail, type TemplateBasename, type TemplateModel } from "./renderTemplate";
import {
  renderContactSubmissionHtml,
  renderContactSubmissionText,
} from "./templates/contactSubmission";
import { htmlToPlainText } from "../lib/htmlToPlainText";

type EmailPayloadBase = {
  to: string;
  name?: string;
};

/** True when a TemplateModel field has content that should render a
 *  conditional section. Used on the VALUE side of optional fields: callers
 *  pass `field: hasContent(field) ? field : null` so Mustache sees a
 *  non-empty scalar (rendered) or null (section hidden). The conditional
 *  idiom used in templates is the same-name scalar section with the dot:
 *      {{#field}} ... "{{.}}" ... {{/field}}
 *  In standard Mustache `null`/`false`/empty-array hide the section and
 *  any other value renders it. We coerce empty strings to null so that
 *  optional text fields stay consistent. */
const hasContent = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return true;
};

const CONTACT_EMAIL = "contact@newchums.com";

/** Render + send in one step, used by every templated helper. */
async function dispatch(
  env: Bindings,
  to: string,
  basename: TemplateBasename,
  model: TemplateModel,
  options: { subjectKey?: Parameters<typeof renderEmail>[2]; replyTo?: string; from?: string } = {},
) {
  const rendered = renderEmail(basename, model, options.subjectKey);
  return sendResendEmail(env, {
    from: options.from ?? env.EMAIL_FROM,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    reply_to: options.replyTo,
  });
}

export const sendVerificationEmail = async (
  env: Bindings,
  { to, name, verifyUrl }: EmailPayloadBase & { verifyUrl: string },
) =>
  dispatch(env, to, "verifyEmail", {
    name: name ?? "there",
    verifyUrl,
  });

export const sendPasswordResetEmail = async (
  env: Bindings,
  { to, name, resetUrl }: EmailPayloadBase & { resetUrl: string },
) =>
  dispatch(env, to, "passwordReset", {
    name: name ?? "there",
    resetUrl,
  });

export const sendEmailChangeConfirmEmail = async (
  env: Bindings,
  { to, name, confirmUrl }: EmailPayloadBase & { confirmUrl: string },
) =>
  dispatch(env, to, "emailChangeConfirm", {
    name: name ?? "there",
    confirmUrl,
  });

export const sendEmailChangeNotifyOldEmail = async (
  env: Bindings,
  { to, name, newEmail }: EmailPayloadBase & { newEmail: string },
) =>
  dispatch(env, to, "emailChangeNotifyOld", {
    name: name ?? "there",
    newEmail,
  });

export const sendEmailChangeSuccessEmail = async (
  env: Bindings,
  { to, name }: EmailPayloadBase,
) =>
  dispatch(env, to, "emailChangeSuccess", {
    name: name ?? "there",
  });

export const sendChumInviteEmail = async (
  env: Bindings,
  {
    to,
    inviterName,
    inviteUrl,
  }: { to: string; inviterName: string; inviteUrl: string },
) =>
  dispatch(env, to, "chumInvite", {
    inviterName,
    inviteUrl,
  });

export const sendEventInviteEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    hostName,
    eventTitle,
    eventDate,
    eventLocation,
    eventUrl,
    inviteToken,
    unsubscribeUrl,
    suggestTimeNote,
    customMessage,
  }: {
    to: string;
    recipientName: string;
    hostName: string;
    eventTitle: string;
    eventDate: string;
    eventLocation?: string;
    eventUrl: string;
    inviteToken?: string;
    unsubscribeUrl?: string;
    suggestTimeNote?: string;
    customMessage?: string;
  },
) => {
  const tokenParam = inviteToken
    ? `&invite_token=${encodeURIComponent(inviteToken)}`
    : "";
  const goingUrl = `${eventUrl}?rsvp=going${tokenParam}`;
  const maybeUrl = `${eventUrl}?rsvp=maybe${tokenParam}`;
  const cantMakeItUrl = `${eventUrl}?rsvp=cant_make_it${tokenParam}`;
  const viewUrl = inviteToken
    ? `${eventUrl}?invite_token=${encodeURIComponent(inviteToken)}`
    : eventUrl;
  return dispatch(env, to, "eventInvite", {
    recipientName,
    hostName,
    eventTitle,
    eventDate,
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    eventUrl: viewUrl,
    goingUrl,
    maybeUrl,
    cantMakeItUrl,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
    suggestTimeNote: hasContent(suggestTimeNote) ? suggestTimeNote : null,
    customMessage: hasContent(customMessage) ? customMessage : null,
  });
};

export type PlanChangeItem = { fieldName: string; oldValue: string; newValue: string };

function formatChange(c: PlanChangeItem): string {
  return `${c.fieldName}: ${c.newValue} (previously was ${c.oldValue})`;
}

export const sendEventChangedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    eventTitle,
    eventUrl,
    changeType,
    changes,
    eventDate,
    eventLocation,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    eventTitle: string;
    eventUrl: string;
    changeType: "updated" | "locked" | "canceled";
    changes?: PlanChangeItem[];
    eventDate?: string;
    eventLocation?: string;
    unsubscribeUrl?: string;
  },
) => {
  const headingMap = {
    canceled: "A plan has been cancelled",
    locked: "A plan you're attending has been locked",
    updated: "A plan you're attending has been updated",
  };
  const bodyMap = {
    canceled: `Hey ${recipientName}, we're sorry to let you know that a plan you were attending has been cancelled by the host. We hope to see you at the next one.`,
    locked: `Hey ${recipientName}, the host has locked a plan you're attending. Your spot is confirmed, no action needed. You can still view the plan details below.`,
    updated: `Hey ${recipientName}, the host has made changes to a plan you're attending. Review the updates below.`,
  };
  const statusMap = {
    canceled: "Plan, Cancelled",
    locked: "Plan, Locked",
    updated: "Plan, Updated",
  };
  const ctaMap = {
    canceled: "View plan details",
    locked: "View plan",
    updated: "View updated plan",
  };

  // The "What changed" block is pre-rendered server-side and dropped into
  // the template via the same-name scalar section + {{.}} (text version)
  // or triple-stache (HTML version). When there are no changes we pass
  // null so the conditional section stays hidden.
  const hasAnyChanges = !!(changes && changes.length > 0);
  const changesBlockHtml = hasAnyChanges
    ? (() => {
        const rows = changes!
          .map(
            (c) =>
              `<p style="margin: 0 0 4px 0; font-family: ${FONT}; font-size: 14px; color: #4B5563; line-height: 1.55;">${escapeHtml(formatChange(c))}</p>`,
          )
          .join("");
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 22px; border-left: 3px solid #E65B13; background-color: #FFF7ED; border-radius: 0 8px 8px 0;"><tr><td style="padding: 14px 20px;"><p style="margin: 0 0 8px 0; font-family: ${FONT}; font-size: 11px; font-weight: 600; color: #E65B13; text-transform: uppercase; letter-spacing: 0.5px;">What changed</p>${rows}</td></tr></table>`;
      })()
    : null;
  const changesBlockText = hasAnyChanges
    ? "What changed:\n" + changes!.map((c) => `- ${formatChange(c)}`).join("\n")
    : null;

  return dispatch(env, to, "eventChanged", {
    heading: headingMap[changeType],
    bodyText: bodyMap[changeType],
    statusLabel: statusMap[changeType],
    statusColor: changeType === "canceled" ? "#6B7280" : "#E65B13",
    eventTitle,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    ctaUrl: eventUrl,
    ctaText: ctaMap[changeType],
    changesBlockHtml,
    changesBlockText,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });
};

/**
 * Sent when the host changed the plan's date/time and asked attendees to
 * reconfirm. Going RSVPs have already been softened to Maybe by the PATCH
 * handler; `wasGoing` switches the copy between "your RSVP was set to
 * Maybe" and the already-Maybe variant. `changes` should exclude the
 * date/time item, the new time is the centerpiece of this email.
 */
export const sendRsvpReconfirmRequestEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    hostName,
    eventTitle,
    eventUrl,
    newDate,
    oldDate,
    eventLocation,
    wasGoing,
    changes,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    hostName: string;
    eventTitle: string;
    eventUrl: string;
    newDate: string;
    oldDate: string;
    eventLocation?: string;
    wasGoing: boolean;
    changes?: PlanChangeItem[];
    unsubscribeUrl?: string;
  },
) => {
  const hasAnyChanges = !!(changes && changes.length > 0);
  const changesBlockHtml = hasAnyChanges
    ? (() => {
        const rows = changes!
          .map(
            (c) =>
              `<p style="margin: 0 0 4px 0; font-family: ${FONT}; font-size: 14px; color: #4B5563; line-height: 1.55;">${escapeHtml(formatChange(c))}</p>`,
          )
          .join("");
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 22px; border-left: 3px solid #E65B13; background-color: #FFF7ED; border-radius: 0 8px 8px 0;"><tr><td style="padding: 14px 20px;"><p style="margin: 0 0 8px 0; font-family: ${FONT}; font-size: 11px; font-weight: 600; color: #E65B13; text-transform: uppercase; letter-spacing: 0.5px;">Also changed</p>${rows}</td></tr></table>`;
      })()
    : null;
  const changesBlockText = hasAnyChanges
    ? "Also changed:\n" + changes!.map((c) => `- ${formatChange(c)}`).join("\n")
    : null;

  return dispatch(env, to, "rsvpReconfirmRequest", {
    recipientName,
    hostName,
    eventTitle,
    eventUrl,
    newDate,
    oldDate,
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    wasGoing,
    goingUrl: `${eventUrl}?rsvp=going`,
    cantMakeItUrl: `${eventUrl}?rsvp=cant_make_it`,
    changesBlockHtml,
    changesBlockText,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });
};

type HostRsvpEmailParams = {
  to: string;
  hostName: string;
  attendeeName: string;
  eventTitle: string;
  eventUrl: string;
  attendeeMessage?: string | null;
  eventDate?: string;
  eventLocation?: string;
  unsubscribeUrl?: string;
  /** The attendee's RSVP status before this response ('going' | 'maybe' |
   *  'cant_make_it'), or null/undefined when this is their first response
   *  to the plan. Drives the copy variants below: "left your plan" is only
   *  accurate when a Going attendee backs out; a first-time "can't make
   *  it" is a decline, not a departure. */
  previousStatus?: string | null;
};

type HostRsvpCopy = { heading: string; bodyHtml: string; bodyText: string };

/** Shared TemplateModel builder for the three host-RSVP notification
 *  emails. All three use the same shell template fields; the helper
 *  supplies heading/body copy chosen from the attendee's previous status
 *  (bodyHtml is pre-escaped and injected via triple-stache). */
const buildHostRsvpModel = (params: HostRsvpEmailParams, copy: HostRsvpCopy): TemplateModel => ({
  hostName: params.hostName,
  attendeeName: params.attendeeName,
  eventTitle: params.eventTitle,
  eventUrl: params.eventUrl,
  eventDate: params.eventDate || "",
  eventLocation: hasContent(params.eventLocation) ? params.eventLocation : null,
  attendeeMessage: hasContent(params.attendeeMessage) ? params.attendeeMessage : null,
  unsubscribeUrl: hasContent(params.unsubscribeUrl) ? params.unsubscribeUrl : null,
  heading: copy.heading,
  bodyHtml: copy.bodyHtml,
  bodyText: copy.bodyText,
});

/** Sent when a plan chat message's author opts to notify attendees. One email
 *  per recipient (rate-limited upstream); the message body is truncated to a
 *  short preview. */
export const sendChatMessageNotifyEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    senderName,
    eventTitle,
    messagePreview,
    eventUrl,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    senderName: string;
    eventTitle: string;
    messagePreview: string;
    eventUrl: string;
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "chatMessageNotify", {
    recipientName: recipientName || "there",
    senderName: senderName || "Someone",
    eventTitle,
    messagePreview,
    eventUrl,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

export const sendEventJoinEmail = async (env: Bindings, params: HostRsvpEmailParams) => {
  const name = escapeHtml(params.attendeeName);
  const wasMaybe = params.previousStatus === "maybe";
  const wasOut = params.previousStatus === "cant_make_it";
  const copy: HostRsvpCopy = wasOut
    ? {
        heading: "Someone is going to your plan",
        bodyHtml: `Great news, <strong>${name}</strong> can make it after all and is now going.`,
        bodyText: `Great news, ${params.attendeeName} can make it after all and is now going.`,
      }
    : wasMaybe
      ? {
          heading: "Someone is going to your plan",
          bodyHtml: `Great news, <strong>${name}</strong> has upgraded their RSVP from Maybe and is now going.`,
          bodyText: `Great news, ${params.attendeeName} has upgraded their RSVP from Maybe and is now going.`,
        }
      : {
          heading: "Someone is going to your plan",
          bodyHtml: `Great news, <strong>${name}</strong> just confirmed they're attending.`,
          bodyText: `Great news, ${params.attendeeName} just confirmed they're attending.`,
        };
  return dispatch(env, params.to, "eventJoin", buildHostRsvpModel(params, copy), {
    subjectKey: wasMaybe || wasOut ? "eventJoin_nowGoing" : undefined,
  });
};

export const sendEventLeaveEmail = async (env: Bindings, params: HostRsvpEmailParams) => {
  const name = escapeHtml(params.attendeeName);
  // "Left your plan" is only true when a Going attendee backs out. A first
  // response to an invite or share link, or a Maybe declining, is a
  // "can't make it", the person was never confirmed in the plan.
  const wasGoing = params.previousStatus === "going";
  const copy: HostRsvpCopy = wasGoing
    ? {
        heading: "Someone left your plan",
        bodyHtml: `Just a heads-up, <strong>${name}</strong> was going but can no longer make it.`,
        bodyText: `Just a heads-up, ${params.attendeeName} was going but can no longer make it.`,
      }
    : {
        heading: "Someone can't make it",
        bodyHtml: `Just a heads-up, <strong>${name}</strong> has let you know they can't make it.`,
        bodyText: `Just a heads-up, ${params.attendeeName} has let you know they can't make it.`,
      };
  return dispatch(env, params.to, "eventLeave", buildHostRsvpModel(params, copy), {
    subjectKey: wasGoing ? undefined : "eventLeave_declined",
  });
};

export const sendEventMaybeEmail = async (env: Bindings, params: HostRsvpEmailParams) => {
  const name = escapeHtml(params.attendeeName);
  // Going -> Maybe is a downgrade the host should notice, not a fresh
  // "might come" signal.
  const wasGoing = params.previousStatus === "going";
  const copy: HostRsvpCopy = wasGoing
    ? {
        heading: "An attendee is now a maybe",
        bodyHtml: `Just a heads-up, <strong>${name}</strong> was going but has changed their RSVP to Maybe.`,
        bodyText: `Just a heads-up, ${params.attendeeName} was going but has changed their RSVP to Maybe.`,
      }
    : {
        heading: "Someone might attend your plan",
        bodyHtml: `<strong>${name}</strong> is interested but hasn't fully committed yet.`,
        bodyText: `${params.attendeeName} is interested but hasn't fully committed yet.`,
      };
  return dispatch(env, params.to, "eventMaybe", buildHostRsvpModel(params, copy), {
    subjectKey: wasGoing ? "eventMaybe_wasGoing" : undefined,
  });
};

export const sendAttendeeRemovedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    hostName,
    eventTitle,
    eventUrl,
    eventDate,
    eventLocation,
    removalReason,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    hostName: string;
    eventTitle: string;
    eventUrl: string;
    eventDate?: string;
    eventLocation?: string;
    removalReason?: string | null;
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "attendeeRemoved", {
    recipientName,
    hostName,
    eventTitle,
    eventUrl,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    removalReason: hasContent(removalReason) ? removalReason : null,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

export const sendJoinRequestEmail = async (
  env: Bindings,
  {
    to,
    hostName,
    requesterName,
    eventTitle,
    requestMessage,
    eventUrl,
    eventDate,
    eventLocation,
    unsubscribeUrl,
  }: {
    to: string;
    hostName: string;
    requesterName: string;
    eventTitle: string;
    requestMessage: string;
    eventUrl: string;
    eventDate?: string;
    eventLocation?: string;
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "joinRequestToHost", {
    hostName,
    requesterName,
    eventTitle,
    eventUrl,
    requestMessage: hasContent(requestMessage) ? requestMessage : null,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

export const sendJoinRequestApprovedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    hostName,
    eventTitle,
    hostMessage,
    eventUrl,
    eventDate,
    eventLocation,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    hostName: string;
    eventTitle: string;
    hostMessage: string | null;
    eventUrl: string;
    eventDate?: string;
    eventLocation?: string;
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "joinRequestApproved", {
    recipientName,
    hostName,
    eventTitle,
    eventUrl,
    hostMessage: hasContent(hostMessage) ? hostMessage : null,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

export const sendJoinRequestDeclinedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    hostName,
    eventTitle,
    hostMessage,
    eventUrl,
    eventDate,
    eventLocation,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    hostName: string;
    eventTitle: string;
    hostMessage: string | null;
    eventUrl: string;
    eventDate?: string;
    eventLocation?: string;
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "joinRequestDeclined", {
    recipientName,
    hostName,
    eventTitle,
    eventUrl,
    hostMessage: hasContent(hostMessage) ? hostMessage : null,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

// ── Unread chat digest email ────────────────────────────────────────────

export type DigestPlanItem = {
  title: string;
  unreadCount: number;
  url: string;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  {
    to,
    recipientName,
    plans,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    plans: DigestPlanItem[];
    unsubscribeUrl?: string;
  },
) => {
  const maxPlans = Math.min(plans.length, 5);
  const planCardsHtml = plans
    .slice(0, maxPlans)
    .map((p) => buildPlanCardHtml(p.title, p.unreadCount, p.url))
    .join("\n");
  const planCardsText = plans
    .slice(0, maxPlans)
    .map((p) => buildPlanCardText(p.title, p.unreadCount, p.url))
    .join("\n");

  return dispatch(env, to, "unreadChatDigest", {
    recipientName,
    planCount: plans.length,
    planCards: planCardsHtml,
    planCardsText,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
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
  const maxSeats =
    maxRaw != null && Number.isFinite(Number(maxRaw)) ? Math.floor(Number(maxRaw)) : null;
  if (maxSeats == null || maxSeats < 1) return "No seat limit";

  const going = Math.max(0, Math.floor(params.goingCount));
  const reserved = params.reserveSeats
    ? Math.max(0, Math.floor(params.pendingInviteNoRsvpCount)) +
      Math.max(0, Math.floor(params.maybeInviteeCount))
    : 0;
  const occupied = going + reserved;
  const remaining = maxSeats - occupied;
  if (remaining <= 0) return "This plan is full";
  return `${remaining} of ${maxSeats} seats remain`;
}

function buildMatchPlanCardHtml(plan: EventMatchPlanItem): string {
  const descText = htmlToPlainText(plan.description);
  const descSnippet =
    descText.length > 120 ? escapeHtml(descText.slice(0, 117)) + "..." : escapeHtml(descText);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 10px; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden;">
  <tr><td style="background-color: #E65B13; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
  <tr><td style="padding: 16px 20px;">
    <p style="margin: 0 0 6px 0; font-family: ${FONT}; font-size: 16px; font-weight: 700; color: #1F2937; line-height: 1.3;">${escapeHtml(plan.title)}</p>${
      descSnippet
        ? `\n    <p style="margin: 0 0 8px 0; font-family: ${FONT}; font-size: 13px; color: #4B5563; line-height: 1.45;">${descSnippet}</p>`
        : ""
    }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align: top;">
          <p style="margin: 0 0 2px 0; font-family: ${FONT}; font-size: 13px; color: #6B7280;">&#128197;&ensp;${escapeHtml(plan.date)}</p>${
            plan.location
              ? `\n          <p style="margin: 0 0 2px 0; font-family: ${FONT}; font-size: 13px; color: #6B7280;">&#128205;&ensp;${escapeHtml(plan.location)}</p>`
              : ""
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
  const descText = htmlToPlainText(plan.description);
  const descSnippet = descText.length > 120 ? descText.slice(0, 117) + "..." : descText;
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
  {
    to,
    recipientName,
    plans,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    plans: EventMatchPlanItem[];
    unsubscribeUrl?: string;
  },
) => {
  const maxPlans = Math.min(plans.length, 10);
  const displayed = plans.slice(0, maxPlans);
  const planCardsHtml = displayed.map((p) => buildMatchPlanCardHtml(p)).join("\n");
  const planCardsText = displayed.map((p) => buildMatchPlanCardText(p)).join("\n\n");

  return dispatch(env, to, "eventMatchDigest", {
    recipientName,
    planCount: plans.length,
    planNoun: plans.length === 1 ? "plan" : "plans",
    planCards: planCardsHtml,
    planCardsText,
    exploreUrl: `${env.WEB_BASE_URL}/`,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });
};

// ── Lightweight-signup magic link email ──────────────────────────────────

export const sendMagicLinkSignupEmail = async (
  env: Bindings,
  { to, confirmUrl, planTitle }: { to: string; confirmUrl: string; planTitle: string },
) =>
  dispatch(env, to, "magicLinkSignup", {
    confirmUrl,
    planTitle,
  });

// ── Plan-signin notice for existing accounts ─────────────────────────────

export const sendPlanSigninEmail = async (
  env: Bindings,
  { to, loginUrl, planTitle }: { to: string; loginUrl: string; planTitle: string },
) =>
  dispatch(env, to, "planSignin", {
    loginUrl,
    planTitle,
  });

// ── Return-visit sign-in link (password setup pending) ──────────────────

export const sendSigninLinkEmail = async (
  env: Bindings,
  { to, confirmUrl }: { to: string; confirmUrl: string },
) =>
  dispatch(env, to, "signinLink", {
    confirmUrl,
  });

// ── Attendance assurance emails ─────────────────────────────────────────

export const sendConfirmationRequestEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    eventTitle,
    eventDate,
    eventLocation,
    eventUrl,
    ctaUrl,
    isHost,
    isReminder,
    isFinal,
    deadline,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    eventTitle: string;
    eventDate: string;
    eventLocation?: string;
    eventUrl: string;
    ctaUrl: string;
    isHost: boolean;
    isReminder: boolean;
    isFinal: boolean;
    deadline: string;
    unsubscribeUrl?: string;
  },
) => {
  const stage: "initial" | "reminder" | "final" = isFinal
    ? "final"
    : isReminder
      ? "reminder"
      : "initial";

  const headingMap = {
    initial: isHost ? "Confirm you're still hosting" : "Confirm your attendance",
    reminder: isHost ? "Quick check: are you still hosting?" : "Quick check: are you still coming?",
    final: isHost ? "Last call: are you still hosting?" : "Last call: are you still coming?",
  } as const;

  const bodyAttendee = {
    initial:
      "Your plan is coming up soon. Please confirm whether you're still in so the host can plan ahead.",
    reminder:
      "Your plan is later today. Please let the host know whether you're still in so they can plan ahead.",
    final: "Your plan starts soon. Please respond now so the host knows who to expect.",
  } as const;
  const bodyHost = {
    initial:
      "Your plan is coming up soon. Please confirm you're still hosting so attendees know it's going ahead.",
    reminder:
      "Your plan is later today. Please confirm you're still hosting so attendees know it's going ahead.",
    final:
      "Your plan starts soon. Please confirm you're still hosting so attendees aren't left guessing.",
  } as const;

  return dispatch(
    env,
    to,
    "confirmationRequestUser",
    {
      heading: headingMap[stage],
      greeting: `Hi ${recipientName},`,
      bodyText: isHost ? bodyHost[stage] : bodyAttendee[stage],
      recipientName,
      eventTitle,
      eventDate,
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      eventUrl,
      ctaUrl,
      deadline,
      isReminder: isReminder || isFinal,
      isFinal: !!isFinal,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
    },
    { subjectKey: isHost ? "confirmationRequestUser_host" : "confirmationRequestUser_attendee" },
  );
};

export const sendPlanAtRiskEmail = async (
  env: Bindings,
  {
    to,
    hostName,
    eventTitle,
    eventUrl,
    eventDate,
    eventLocation,
    confirmedCount,
    minRequired,
    unsubscribeUrl,
  }: {
    to: string;
    hostName: string;
    eventTitle: string;
    eventUrl: string;
    eventDate?: string;
    eventLocation?: string;
    confirmedCount: number;
    minRequired: number;
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "planAtRisk", {
    heading: `Attendance check: ${confirmedCount} of ${minRequired} confirmed`,
    bodyText: `Hey ${hostName}, your plan's 24-hour attendance check didn't reach the minimum of ${minRequired} confirmed. Only ${confirmedCount} confirmed so far. Please review and decide whether to proceed or cancel. If you do nothing, the plan will go ahead as scheduled.`,
    hostName,
    eventTitle,
    eventUrl,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    confirmedCount,
    minRequired,
    ctaUrl: eventUrl,
    ctaText: "Review and decide",
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

export const sendPlanAutoCancelledEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    eventTitle,
    eventUrl,
    confirmedCount,
    minRequired,
    eventDate,
    eventLocation,
    unsubscribeUrl,
    reason,
  }: {
    to: string;
    recipientName: string;
    eventTitle: string;
    eventUrl: string;
    /** Count that fell short of `minRequired`. For the 24-hour confirmation
     *  flow this is the confirmed-count; for the RSVP-based minimum it is
     *  the count of "going" RSVPs at the cutoff. */
    confirmedCount: number;
    minRequired: number;
    eventDate?: string;
    eventLocation?: string;
    unsubscribeUrl?: string;
    /** Which auto-cancel pathway triggered this email. Determines body copy
     *  so attendees can tell whether the plan fell short on the 24-hour
     *  confirmation check or on the simpler RSVP threshold. Default:
     *  'min_confirmed' (the original 24-hour-attendance-check use). */
    reason?: "min_confirmed" | "min_attendees_required";
  },
) => {
  const variant = reason ?? "min_confirmed";
  const heading = "A plan you were attending has been cancelled";
  const bodyText =
    variant === "min_attendees_required"
      ? `Hey ${recipientName}, unfortunately "${eventTitle}" didn't reach its minimum of ${minRequired} ${minRequired === 1 ? "person" : "people"} going by the 2-hour cutoff (only ${confirmedCount} ${confirmedCount === 1 ? "was" : "were"} going), so it's been automatically cancelled.`
      : `Hey ${recipientName}, unfortunately "${eventTitle}" didn't reach its minimum of ${minRequired} confirmed attendees (only ${confirmedCount} confirmed), so it's been automatically cancelled.`;
  const reasonText =
    variant === "min_attendees_required"
      ? `Only ${confirmedCount} of ${minRequired} required attendees were going at the 2-hour cutoff`
      : `Only ${confirmedCount} of ${minRequired} required attendees confirmed`;

  return dispatch(env, to, "planAutoCancelled", {
    heading,
    bodyText,
    eventTitle,
    eventDate: eventDate || "",
    eventLocation: hasContent(eventLocation) ? eventLocation : null,
    reasonText,
    ctaUrl: eventUrl,
    ctaText: "View plan details",
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });
};

export const sendPlanRemovedByAdminEmail = async (
  env: Bindings,
  {
    to,
    hostName,
    eventTitle,
    reason,
  }: {
    to: string;
    hostName: string;
    eventTitle: string;
    reason?: string;
  },
) =>
  dispatch(env, to, "planRemovedByAdmin", {
    hostName,
    eventTitle,
    reason: hasContent(reason) ? reason : null,
  });

export const sendRoadmapUpdateEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    itemTitle,
    itemUrl,
    updateType,
    statusLabel,
    adminNote,
    mergedIntoTitle,
    mergedIntoUrl,
    unsubscribeUrl,
  }: {
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
  },
) =>
  dispatch(env, to, "roadmapUpdate", {
    recipientName,
    itemTitle,
    itemUrl,
    updateType,
    statusLabel: hasContent(statusLabel) ? statusLabel : null,
    adminNote: hasContent(adminNote) ? adminNote : null,
    mergedIntoTitle: hasContent(mergedIntoTitle) ? mergedIntoTitle : null,
    mergedIntoUrl: hasContent(mergedIntoUrl) ? mergedIntoUrl : null,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

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
  },
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
    environment:
      env.APP_ENV === "production"
        ? "Prod"
        : env.APP_ENV === "development"
          ? "Local"
          : env.APP_ENV ?? "Unknown",
  };

  const htmlBody = renderContactSubmissionHtml(templateParams);
  const textBody = renderContactSubmissionText(templateParams);

  await sendResendEmail(env, {
    from: CONTACT_EMAIL,
    to: CONTACT_EMAIL,
    subject: `NewChums: Contact, ${params.subject}`,
    html: htmlBody,
    text: textBody,
    reply_to: params.email,
  });
};

export const sendPlanFeedbackEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    planTitle,
    planUrl,
    planDate,
    planLocation,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    planTitle: string;
    planUrl: string;
    planDate?: string;
    planLocation?: string;
    unsubscribeUrl: string;
  },
) =>
  dispatch(env, to, "planFeedback", {
    heading: "How did your plan go?",
    greeting: `Hi ${recipientName},`,
    bodyText:
      "Your plan has wrapped up. Leaving a bit of feedback helps NewChums make better matches for you and keeps future plans more reliable.",
    recipientName,
    planTitle,
    planUrl,
    planDate: hasContent(planDate) ? planDate : null,
    planLocation: hasContent(planLocation) ? planLocation : null,
    ctaUrl: planUrl,
    ctaText: "Leave feedback",
    ctaHelperText: "Quick and private. Takes about a minute.",
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

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
  },
) =>
  dispatch(env, CONTACT_EMAIL, "concernReportAlert", {
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
  });

// ── Community join request notifications ─────────────────────────────────

export const sendCommunityJoinRequestEmail = async (
  env: Bindings,
  {
    to,
    ownerName,
    requesterName,
    communityName,
    communityUrl,
    message,
  }: {
    to: string;
    ownerName: string;
    requesterName: string;
    communityName: string;
    communityUrl: string;
    message?: string | null;
  },
) => {
  const trimmed = typeof message === "string" ? message.trim() : "";
  const messageValue = trimmed.length > 0 ? trimmed : null;
  return dispatch(env, to, "communityJoinRequest", {
    ownerName,
    requesterName,
    communityName,
    communityUrl,
    message: messageValue,
  });
};

export const sendCommunityJoinApprovedEmail = async (
  env: Bindings,
  {
    to,
    userName,
    communityName,
    communityUrl,
  }: {
    to: string;
    userName: string;
    communityName: string;
    communityUrl: string;
  },
) =>
  dispatch(env, to, "communityJoinApproved", {
    userName,
    communityName,
    communityUrl,
  });

export const sendCommunityJoinDeclinedEmail = async (
  env: Bindings,
  {
    to,
    userName,
    communityName,
  }: {
    to: string;
    userName: string;
    communityName: string;
  },
) =>
  dispatch(env, to, "communityJoinDeclined", {
    userName,
    communityName,
  });

export const sendCommunityMemberRemovedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    communityName,
    communityUrl,
    removalReason,
  }: {
    to: string;
    recipientName: string;
    communityName: string;
    communityUrl: string;
    removalReason?: string | null;
  },
) =>
  dispatch(env, to, "communityMemberRemoved", {
    recipientName,
    communityName,
    communityUrl,
    removalReason: hasContent(removalReason) ? removalReason : null,
  });

export const sendCommunityMemberUnblockedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    communityName,
    communityUrl,
  }: {
    to: string;
    recipientName: string;
    communityName: string;
    communityUrl: string;
  },
) =>
  dispatch(env, to, "communityMemberUnblocked", {
    recipientName,
    communityName,
    communityUrl,
  });

// ── Community announcement notification ─────────────────────────────────
//
// Sent to active community members when an owner posts an announcement
// with the "Email members" option enabled. The HTML body is pre-rendered
// (sanitized) and inserted via triple-stache `{{{announcementBodyHtml}}}`
// in the template. The plain-text fallback is the htmlToPlainText
// projection of the same body, passed via a same-name scalar section +
// `{{.}}` so it's only rendered when present.

export const sendCommunityAnnouncementEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    communityName,
    communityUrl,
    announcementTitle,
    announcementBodyHtml,
    announcementBodyText,
    communityMuteUrl,
    settingsUrl,
    unsubscribeUrl,
  }: {
    to: string;
    recipientName: string;
    communityName: string;
    communityUrl: string;
    announcementTitle: string;
    /** Sanitized HTML body for the message block (already passed through
     *  `sanitizeDescriptionHtml`, identical to what's stored on the
     *  announcement row). */
    announcementBodyHtml: string;
    /** Plain-text projection of the body for the .txt template. */
    announcementBodyText: string;
    /** Per-community mute deeplink (`/communities/<slug>?mute=announcements`). */
    communityMuteUrl: string;
    /** Global notification settings deeplink. */
    settingsUrl: string;
    /** Tokenized one-click unsubscribe for the `community_announcements`
     *  notification key. Optional, omitted in environments where
     *  `NEXTAUTH_SECRET` is not configured. */
    unsubscribeUrl?: string;
  },
) =>
  dispatch(env, to, "communityAnnouncement", {
    recipientName,
    communityName,
    communityUrl,
    announcementTitle,
    announcementBodyHtml,
    announcementBodyText: hasContent(announcementBodyText) ? announcementBodyText : null,
    communityMuteUrl,
    settingsUrl,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
  });

export const sendCommunityJoinRequestReopenedEmail = async (
  env: Bindings,
  {
    to,
    recipientName,
    communityName,
    communityUrl,
  }: {
    to: string;
    recipientName: string;
    communityName: string;
    communityUrl: string;
  },
) =>
  dispatch(env, to, "communityJoinRequestReopened", {
    recipientName,
    communityName,
    communityUrl,
  });
