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

const CONTACT_EMAIL = "contact@newchums.com";

export const sendContactFormEmail = async (
  env: Bindings,
  params: {
    name: string;
    email: string;
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
    message: params.message,
    requestIp: params.requestIp,
    timestamp,
    userId: params.userId,
    username: params.username,
  };

  const htmlBody = renderContactSubmissionHtml(templateParams);
  const textBody = renderContactSubmissionText(templateParams);

  await sendPostmarkRawEmail(env, {
    From: CONTACT_EMAIL,
    To: CONTACT_EMAIL,
    Subject: "NewChums: Contact form submission",
    HtmlBody: htmlBody,
    TextBody: textBody,
    ReplyTo: params.email,
  });
};
