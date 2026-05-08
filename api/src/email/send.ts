import type { Bindings } from "../db";
import { sendPostmarkRawEmail, sendPostmarkTemplateEmail } from "./postmark";
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
 *  pass `field: hasContent(field) ? field : null` so Postmark's Mustachio
 *  sees a non-empty scalar (rendered) or null (section hidden). Empty
 *  strings must never be sent because Mustachio treats `""` as truthy
 *  inside `{{#field}}...{{/field}}` blocks.
 *
 *  The template side uses the SAME-NAME scalar-section idiom with the dot
 *  for the value:
 *      {{#field}} ... "{{.}}" ... {{/field}}
 *  Postmark does not walk up to the parent scope inside a scalar section,
 *  so a `{{#hasField}}...{{field}}...{{/hasField}}` pattern would NOT
 *  render the value, even though it's legal Mustache. See
 *  docs/Technical_Specs.md -> "Postmark email templates (Mustachio)". */
const hasContent = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return true;
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
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      eventUrl: viewUrl, goingUrl, maybeUrl, cantMakeItUrl,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      suggestTimeNote: hasContent(suggestTimeNote) ? suggestTimeNote : null,
      customMessage: hasContent(customMessage) ? customMessage : null,
      year: new Date().getFullYear(),
    },
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
    canceled: "View plan details",
    locked:   "View plan",
    updated:  "View updated plan",
  };

  // Build the "What changed" block server-side, same strategy used by
  // unreadChatDigest's planCards field. Postmark's Mustachio does not walk
  // up the parent scope inside a scalar section, so a per-row
  // {{#changeN}}{{changeN}}{{/changeN}} pattern would render empty rows.
  // Pre-rendering the whole block keeps the template a single scalar
  // section that just dumps the HTML/text via {{.}}. When there are no
  // changes we pass null, which hides the block entirely.
  const hasAnyChanges = !!(changes && changes.length > 0);
  const changesBlockHtml = hasAnyChanges
    ? (() => {
        const rows = changes!.map((c) =>
          `<p style="margin: 0 0 4px 0; font-family: ${FONT}; font-size: 14px; color: #4B5563; line-height: 1.55;">${escapeHtml(formatChange(c))}</p>`
        ).join("");
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 22px; border-left: 3px solid #E65B13; background-color: #FFF7ED; border-radius: 0 8px 8px 0;"><tr><td style="padding: 14px 20px;"><p style="margin: 0 0 8px 0; font-family: ${FONT}; font-size: 11px; font-weight: 600; color: #E65B13; text-transform: uppercase; letter-spacing: 0.5px;">What changed</p>${rows}</td></tr></table>`;
      })()
    : null;
  const changesBlockText = hasAnyChanges
    ? "What changed:\n" + changes!.map((c) => `- ${formatChange(c)}`).join("\n")
    : null;

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
      eventDate:     eventDate || "",
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      // Canceled plans now link to the plan detail page so the recipient
      // can see the cancellation banner and reason (for auto-cancel this
      // includes the confirmed / minimum counts). Previously sent to the
      // site homepage, which dropped that context.
      ctaUrl:        eventUrl,
      ctaText:       ctaMap[changeType],
      changesBlockHtml,
      changesBlockText,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      year: new Date().getFullYear(),
    },
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

/** Shared TemplateModel builder for the three host-RSVP notification
 *  emails. All three use the same conditional-section fields. */
const buildHostRsvpModel = (params: HostRsvpEmailParams) => ({
  productName: "NewChums",
  hostName: params.hostName,
  attendeeName: params.attendeeName,
  eventTitle: params.eventTitle,
  eventUrl: params.eventUrl,
  eventDate: params.eventDate || "",
  eventLocation: hasContent(params.eventLocation) ? params.eventLocation : null,
  attendeeMessage: hasContent(params.attendeeMessage) ? params.attendeeMessage : null,
  unsubscribeUrl: hasContent(params.unsubscribeUrl) ? params.unsubscribeUrl : null,
  year: new Date().getFullYear(),
});

export const sendEventJoinEmail = async (
  env: Bindings, params: HostRsvpEmailParams
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_JOIN) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: params.to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_JOIN,
    TemplateModel: buildHostRsvpModel(params),
  });
};

export const sendEventLeaveEmail = async (
  env: Bindings, params: HostRsvpEmailParams
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_LEAVE) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: params.to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_LEAVE,
    TemplateModel: buildHostRsvpModel(params),
  });
};

export const sendEventMaybeEmail = async (
  env: Bindings, params: HostRsvpEmailParams
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_MAYBE) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: params.to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_MAYBE,
    TemplateModel: buildHostRsvpModel(params),
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
      eventDate: eventDate || "",
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      removalReason: hasContent(removalReason) ? removalReason : null,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
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
      productName: "NewChums", hostName, requesterName, eventTitle, eventUrl,
      requestMessage: hasContent(requestMessage) ? requestMessage : null,
      eventDate: eventDate || "",
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      year: new Date().getFullYear(),
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
      productName: "NewChums", recipientName, hostName, eventTitle, eventUrl,
      hostMessage: hasContent(hostMessage) ? hostMessage : null,
      eventDate: eventDate || "",
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      year: new Date().getFullYear(),
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
      productName: "NewChums", recipientName, hostName, eventTitle, eventUrl,
      hostMessage: hasContent(hostMessage) ? hostMessage : null,
      eventDate: eventDate || "",
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      year: new Date().getFullYear(),
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

  const model: Record<string, string | number | boolean | null> = {
    productName: "NewChums",
    recipientName,
    planCount: plans.length,
    planCards: planCardsHtml,
    planCardsText,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl! : null,
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
  // Descriptions come from the Tiptap rich-text editor and include tags like
  // <p>…</p>. Strip to plain text before slicing/escaping so the digest card
  // doesn't render literal "&lt;p&gt;…&lt;/p&gt;" to the recipient.
  const descText = htmlToPlainText(plan.description);
  const descSnippet = descText.length > 120
    ? escapeHtml(descText.slice(0, 117)) + "..."
    : escapeHtml(descText);

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
  const descText = htmlToPlainText(plan.description);
  const descSnippet = descText.length > 120
    ? descText.slice(0, 117) + "..."
    : descText;
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

  const model: Record<string, string | number | boolean | null> = {
    productName: "NewChums",
    recipientName,
    planCount: plans.length,
    planNoun: plans.length === 1 ? "plan" : "plans",
    planCards: planCardsHtml,
    planCardsText,
    exploreUrl: `${env.WEB_BASE_URL}/`,
    unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl! : null,
  };

  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST,
    TemplateModel: model,
  });
};

// ── Lightweight-signup magic link email ──────────────────────────────────
//
// Sent when an unauthenticated visitor starts signing up from the plan page.
// The confirmUrl points at `/auth/magic?...` which consumes a one-time token
// from `email_verification_tokens`, signs them in, and returns them to the
// plan URL carried in `next`.

export const sendMagicLinkSignupEmail = async (
  env: Bindings,
  { to, confirmUrl, planTitle }: { to: string; confirmUrl: string; planTitle: string },
) => {
  if (!env.POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP,
    TemplateModel: {
      productName: "NewChums",
      confirmUrl,
      planTitle,
    },
    TrackLinks: "None",
    TrackOpens: false,
  });
};

// ── Plan-signin notice for existing accounts ─────────────────────────────
//
// Sent when someone submits the plan-signup form with an email that already
// belongs to a verified account. Contains a link to /login?next=<plan url>
// so they can sign in and return to the plan. No token; no DB writes.

export const sendPlanSigninEmail = async (
  env: Bindings,
  { to, loginUrl, planTitle }: { to: string; loginUrl: string; planTitle: string },
) => {
  if (!env.POSTMARK_TEMPLATE_PLAN_SIGNIN) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_PLAN_SIGNIN,
    TemplateModel: {
      productName: "NewChums",
      loginUrl,
      planTitle,
    },
    TrackLinks: "None",
    TrackOpens: false,
  });
};

// ── Return-visit sign-in link (password setup pending) ──────────────────
//
// Sent by `POST /auth/signin-link/request` to lightweight-signup accounts
// that haven't set a password yet. The copy is intentionally framed as
// "sign back in", not as a fresh signup confirmation, so the recipient
// isn't told to "create an account" they already have. The confirmUrl
// points at `/auth/magic?...` and consumes a one-time token from
// `email_verification_tokens`. After consume, the user is redirected to
// `/settings#account` so they land where they can finish setting a
// password (the PasswordSetupBanner stays visible until they do).

export const sendSigninLinkEmail = async (
  env: Bindings,
  { to, confirmUrl }: { to: string; confirmUrl: string },
) => {
  if (!env.POSTMARK_TEMPLATE_SIGNIN_LINK) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_SIGNIN_LINK,
    TemplateModel: {
      productName: "NewChums",
      confirmUrl,
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
  // Postmark template HTML, no template variable needed. This matches the
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
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      eventUrl,
      ctaUrl,
      deadline,
      // Booleans only. Mustachio treats "" as truthy in `{{#field}}` so the
      // previous `"1"` / `""` encoding silently rendered the reminder /
      // final banners every time. Templates read `{{#isReminder}}` and
      // `{{#isFinal}}` on plain booleans.
      isReminder: isReminder || isFinal,
      isFinal: !!isFinal,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
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
      eventLocation: hasContent(eventLocation) ? eventLocation : null,
      confirmedCount,
      minRequired,
      ctaUrl: eventUrl,
      ctaText: "Review and decide",
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      year: new Date().getFullYear(),
    },
  });
};

export const sendPlanAutoCancelledEmail = async (
  env: Bindings,
  { to, recipientName, eventTitle, eventUrl, confirmedCount, minRequired, eventDate, eventLocation, unsubscribeUrl, reason }: {
    to: string; recipientName: string;
    eventTitle: string;
    eventUrl: string;
    /** Count that fell short of `minRequired`. For the 24-hour confirmation
     *  flow this is the confirmed-count; for the RSVP-based minimum it is
     *  the count of "going" RSVPs at the cutoff. */
    confirmedCount: number; minRequired: number;
    eventDate?: string; eventLocation?: string;
    unsubscribeUrl?: string;
    /** Which auto-cancel pathway triggered this email. Determines the body
     *  copy so attendees can tell whether the plan fell short on the
     *  24-hour confirmation check or on the simpler RSVP threshold.
     *  Default: 'min_confirmed' (the original 24-hour-attendance-check use). */
    reason?: "min_confirmed" | "min_attendees_required";
  }
) => {
  const variant = reason ?? "min_confirmed";
  const heading = "A plan you were attending has been cancelled";
  const bodyText = variant === "min_attendees_required"
    ? `Hey ${recipientName}, unfortunately "${eventTitle}" didn't reach its minimum of ${minRequired} ${minRequired === 1 ? "person" : "people"} going by the 2-hour cutoff (only ${confirmedCount} ${confirmedCount === 1 ? "was" : "were"} going), so it's been automatically cancelled.`
    : `Hey ${recipientName}, unfortunately "${eventTitle}" didn't reach its minimum of ${minRequired} confirmed attendees (only ${confirmedCount} confirmed), so it's been automatically cancelled.`;
  const reasonText = variant === "min_attendees_required"
    ? `Only ${confirmedCount} of ${minRequired} required attendees were going at the 2-hour cutoff`
    : `Only ${confirmedCount} of ${minRequired} required attendees confirmed`;
  const fallbackChangeNew = variant === "min_attendees_required"
    ? "Auto-cancelled, minimum attendees not reached"
    : "Auto-cancelled, minimum confirmation not met";

  // Use dedicated template if available, otherwise fall back to the generic eventChanged template
  if (env.POSTMARK_TEMPLATE_PLAN_AUTO_CANCELLED) {
    return sendPostmarkTemplateEmail(env, {
      From: env.EMAIL_FROM, To: to,
      TemplateId: env.POSTMARK_TEMPLATE_PLAN_AUTO_CANCELLED,
      TemplateModel: {
        productName: "NewChums",
        heading,
        bodyText,
        eventTitle,
        eventDate: eventDate || "",
        eventLocation: hasContent(eventLocation) ? eventLocation : null,
        reasonText,
        // Point attendees at the plan detail page (which surfaces the cancelled state)
        // rather than the homepage, so they land on the context they already know.
        ctaUrl: eventUrl,
        ctaText: "View plan details",
        unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
        year: new Date().getFullYear(),
      },
    });
  }
  // Fallback: use generic event-changed template
  if (!env.POSTMARK_TEMPLATE_EVENT_CHANGED) return;
  return sendEventChangedEmail(env, {
    to, recipientName, eventTitle,
    eventUrl,
    changeType: "canceled",
    changes: [{ fieldName: "Reason", oldValue: `${confirmedCount} of ${minRequired}`, newValue: fallbackChangeNew }],
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
      reason: hasContent(reason) ? reason : null,
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
      statusLabel: hasContent(statusLabel) ? statusLabel : null,
      adminNote: hasContent(adminNote) ? adminNote : null,
      mergedIntoTitle: hasContent(mergedIntoTitle) ? mergedIntoTitle : null,
      mergedIntoUrl: hasContent(mergedIntoUrl) ? mergedIntoUrl : null,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
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
      planDate: hasContent(planDate) ? planDate : null,
      planLocation: hasContent(planLocation) ? planLocation : null,
      ctaUrl: planUrl,
      ctaText: "Leave feedback",
      ctaHelperText: "Quick and private. Takes about a minute.",
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
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
  { to, ownerName, requesterName, communityName, communityUrl, message }: {
    to: string; ownerName: string; requesterName: string; communityName: string; communityUrl: string; message?: string | null;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST) return;
  // Postmark Mustachio quirks we have to work around:
  //   1. Empty string "" is truthy inside `{{#field}}...{{/field}}` blocks,
  //      so API callers must never pass `""` as an "absent" value. We send
  //      `null` instead.
  //   2. Inside a scalar section `{{#field}}...{{/field}}`, Postmark does
  //      NOT walk up to the parent scope to resolve `{{otherField}}`. A
  //      `{{#hasMessage}}...{{message}}...{{/hasMessage}}` pattern renders
  //      the wrapper but not the inner value, leaving an empty quoted
  //      block. The safe idiom is the SAME-NAME scalar section with `{{.}}`
  //      inside, which renders the section's own value:
  //        {{#message}} ... "{{.}}" ... {{/message}}
  // See docs/Technical_Specs.md -> "Postmark email templates (Mustachio)".
  const trimmed = typeof message === "string" ? message.trim() : "";
  const messageValue = trimmed.length > 0 ? trimmed : null;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST,
    TemplateModel: {
      productName: "NewChums",
      ownerName,
      requesterName,
      communityName,
      communityUrl,
      message: messageValue,
      year: new Date().getFullYear(),
    },
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

export const sendCommunityMemberRemovedEmail = async (
  env: Bindings,
  { to, recipientName, communityName, communityUrl, removalReason }: {
    to: string; recipientName: string; communityName: string; communityUrl: string;
    removalReason?: string | null;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_MEMBER_REMOVED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_MEMBER_REMOVED,
    TemplateModel: {
      productName: "NewChums",
      recipientName,
      communityName,
      communityUrl,
      removalReason: hasContent(removalReason) ? removalReason : null,
      year: new Date().getFullYear(),
    },
  });
};

export const sendCommunityMemberUnblockedEmail = async (
  env: Bindings,
  { to, recipientName, communityName, communityUrl }: {
    to: string; recipientName: string; communityName: string; communityUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_MEMBER_UNBLOCKED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_MEMBER_UNBLOCKED,
    TemplateModel: {
      productName: "NewChums",
      recipientName,
      communityName,
      communityUrl,
      year: new Date().getFullYear(),
    },
  });
};

// ── Community announcement notification ─────────────────────────────────
//
// Sent to active community members when an owner posts an announcement
// with the "Email members" option enabled. The HTML body is pre-rendered
// (sanitized) and inserted via triple-stache `{{{announcementBodyHtml}}}`
// in the template, mirroring the unreadChatDigest `planCards` and
// eventChanged `changesBlockHtml` pattern. The plain-text fallback is the
// htmlToPlainText projection of the same body, passed via a same-name
// scalar section + `{{.}}` so it's only rendered when present. No empty
// strings: absent fields are passed as null so the corresponding
// `{{#field}}...{{/field}}` blocks stay hidden (see docs/Technical_Specs.md
// → "Postmark email templates (Mustachio)").

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
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_ANNOUNCEMENT) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM,
    To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_ANNOUNCEMENT,
    TemplateModel: {
      productName: "NewChums",
      recipientName,
      communityName,
      communityUrl,
      announcementTitle,
      // Triple-stache field, always present (body is required). Passed
      // through verbatim so sanitized HTML markup renders, not escaped.
      announcementBodyHtml,
      announcementBodyText: hasContent(announcementBodyText) ? announcementBodyText : null,
      communityMuteUrl,
      settingsUrl,
      unsubscribeUrl: hasContent(unsubscribeUrl) ? unsubscribeUrl : null,
      year: new Date().getFullYear(),
    },
  });
};

export const sendCommunityJoinRequestReopenedEmail = async (
  env: Bindings,
  { to, recipientName, communityName, communityUrl }: {
    to: string; recipientName: string; communityName: string; communityUrl: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST_REOPENED) return;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST_REOPENED,
    TemplateModel: {
      productName: "NewChums",
      recipientName,
      communityName,
      communityUrl,
      year: new Date().getFullYear(),
    },
  });
};
