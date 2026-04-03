import type { Bindings } from "../db";

type PostmarkTemplateEmail = {
  From: string;
  To: string;
  TemplateId: string;
  TemplateModel: Record<string, unknown>;
  /** Per-message link tracking override. "None" disables click-tracking redirects. */
  TrackLinks?: "None" | "HtmlAndText" | "HtmlOnly" | "TextOnly";
  /** Per-message open tracking override. false disables the tracking pixel. */
  TrackOpens?: boolean;
};

type PostmarkError = {
  Message?: string;
  ErrorCode?: number;
};

/** Shared template vars merged into every send. Per-email model can override. */
function getBaseTemplateModel(): Record<string, unknown> {
  return { year: new Date().getFullYear() };
}

export const sendPostmarkTemplateEmail = async (
  env: Bindings,
  payload: PostmarkTemplateEmail
) => {
  const templateModel = {
    ...getBaseTemplateModel(),
    ...payload.TemplateModel,
  };

  const requestBody = {
    ...payload,
    TemplateModel: templateModel,
  };

  console.log(
    "[postmark] template:",
    payload.TemplateId,
    "keys:",
    Object.keys(templateModel).sort().join(", ")
  );
  console.log("[postmark] full TemplateModel:", JSON.stringify(templateModel));

  const response = await fetch("https://api.postmarkapp.com/email/withTemplate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(requestBody),
  });

  const responseBody = await response.json();

  if (!response.ok) {
    const errorData = responseBody as PostmarkError;
    const message = errorData?.Message
      ? `Postmark request failed: ${errorData.Message}`
      : `Postmark request failed with status ${response.status}`;
    console.error("[postmark] error response:", JSON.stringify(responseBody));
    throw new Error(message);
  }

  console.log("[postmark] success response:", JSON.stringify(responseBody));
  return responseBody;
};

type PostmarkRawEmail = {
  From: string;
  To: string;
  Subject: string;
  HtmlBody?: string;
  TextBody?: string;
  ReplyTo?: string;
};

/**
 * Send a raw (non-template) email via Postmark.
 * Used for contact form submissions.
 * At least one of HtmlBody or TextBody must be provided.
 */
export const sendPostmarkRawEmail = async (
  env: Bindings,
  payload: PostmarkRawEmail
) => {
  if (env.APP_ENV === "development") {
    console.log("[postmark] raw email:", payload.Subject, "to:", payload.To);
  }

  if (!payload.HtmlBody && !payload.TextBody) {
    throw new Error("Postmark raw email requires HtmlBody or TextBody");
  }

  const body: Record<string, unknown> = {
    From: payload.From,
    To: payload.To,
    Subject: payload.Subject,
    ReplyTo: payload.ReplyTo,
  };
  if (payload.HtmlBody) body.HtmlBody = payload.HtmlBody;
  if (payload.TextBody) body.TextBody = payload.TextBody;

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Postmark request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as PostmarkError;
      if (data?.Message) {
        message = `Postmark request failed: ${data.Message}`;
      }
    } catch {
      // Ignore JSON parsing errors
    }
    throw new Error(message);
  }

  return response.json();
};
