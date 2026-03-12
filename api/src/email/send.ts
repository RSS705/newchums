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
  { to, recipientName, hostName, eventTitle, eventDate, eventLocation, eventUrl, inviteToken }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; eventDate: string; eventLocation?: string; eventUrl: string;
    inviteToken?: string;
  }
) => {
  if (!env.POSTMARK_TEMPLATE_EVENT_INVITE) return;
  const tokenParam = inviteToken ? `&invite_token=${encodeURIComponent(inviteToken)}` : "";
  const goingUrl = `${eventUrl}?rsvp=going${tokenParam}`;
  const maybeUrl = `${eventUrl}?rsvp=maybe${tokenParam}`;
  const cantMakeItUrl = `${eventUrl}?rsvp=cant_make_it${tokenParam}`;
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: env.POSTMARK_TEMPLATE_EVENT_INVITE,
    TemplateModel: {
      productName: "NewChums", recipientName, hostName, eventTitle, eventDate,
      eventLocation: eventLocation || "",
      eventUrl, goingUrl, maybeUrl, cantMakeItUrl,
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

// ── Join-request email helpers ──────────────────────────────────────────
//   6. Join Request (to host)    — hardcoded template 43906440
//      Model: productName, hostName, requesterName, eventTitle, requestMessage, eventUrl
//   7. Join Request Approved     — hardcoded template 43906609
//      Model: productName, recipientName, hostName, eventTitle, hostMessage, eventUrl
//   8. Join Request Declined     — hardcoded template 43906703
//      Model: productName, recipientName, hostName, eventTitle, hostMessage, eventUrl

export const sendJoinRequestEmail = async (
  env: Bindings,
  { to, hostName, requesterName, eventTitle, requestMessage, eventUrl }: {
    to: string; hostName: string; requesterName: string;
    eventTitle: string; requestMessage: string; eventUrl: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906440",
    TemplateModel: { productName: "NewChums", hostName, requesterName, eventTitle, requestMessage, eventUrl },
  });
};

export const sendJoinRequestApprovedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, hostMessage, eventUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; hostMessage: string; eventUrl: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906609",
    TemplateModel: { productName: "NewChums", recipientName, hostName, eventTitle, hostMessage, eventUrl },
  });
};

export const sendJoinRequestDeclinedEmail = async (
  env: Bindings,
  { to, recipientName, hostName, eventTitle, hostMessage, eventUrl }: {
    to: string; recipientName: string; hostName: string;
    eventTitle: string; hostMessage: string; eventUrl: string;
  }
) => {
  return sendPostmarkTemplateEmail(env, {
    From: env.EMAIL_FROM, To: to,
    TemplateId: "43906703",
    TemplateModel: { productName: "NewChums", recipientName, hostName, eventTitle, hostMessage, eventUrl },
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
