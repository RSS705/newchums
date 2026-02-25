import type { Bindings } from "../db";

type PostmarkTemplateEmail = {
  From: string;
  To: string;
  TemplateId: string;
  TemplateModel: Record<string, unknown>;
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

  if (env.APP_ENV === "development") {
    console.log(
      "[postmark] template:",
      payload.TemplateId,
      "keys:",
      Object.keys(templateModel).sort().join(", ")
    );
  }

  const response = await fetch("https://api.postmarkapp.com/email/withTemplate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      ...payload,
      TemplateModel: templateModel,
    }),
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
