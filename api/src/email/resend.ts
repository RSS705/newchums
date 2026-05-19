import type { Bindings } from "../db";

type ResendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
};

type ResendError = {
  name?: string;
  message?: string;
  statusCode?: number;
};

export const sendResendEmail = async (env: Bindings, payload: ResendEmailPayload) => {
  if (!payload.html && !payload.text) {
    throw new Error("Resend email requires html or text body");
  }

  const isDev = env.APP_ENV === "development";
  if (isDev) {
    console.log("[resend] to:", payload.to, "subject:", payload.subject);
  }

  const body: Record<string, unknown> = {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
  };
  if (payload.html) body.html = payload.html;
  if (payload.text) body.text = payload.text;
  if (payload.reply_to) body.reply_to = payload.reply_to;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const errorData = (responseBody ?? {}) as ResendError;
    const message = errorData?.message
      ? `Resend request failed: ${errorData.message}`
      : `Resend request failed with status ${response.status}`;
    console.error("[resend] error response:", JSON.stringify(responseBody));
    throw new Error(message);
  }

  if (isDev) {
    console.log("[resend] success response:", JSON.stringify(responseBody));
  }
  return responseBody;
};
