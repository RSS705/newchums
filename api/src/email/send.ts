import type { Bindings } from "../db";
import { sendPostmarkTemplateEmail } from "./postmark";

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
