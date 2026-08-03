import type { Bindings } from "../db";

type ResendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  /** Stable per-logical-send key. Resend deduplicates on it, which makes a
   *  retry of an ambiguous failure (5xx after possible processing) safe.
   *  Harmless if the provider ignores it. */
  idempotencyKey?: string;
};

/** Error from a Resend response, carrying the HTTP status so callers can
 *  classify retryable (429/5xx) vs permanent (other 4xx) failures. A plain
 *  network throw (no response at all) surfaces as a non-ResendHttpError. */
export class ResendHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ResendHttpError";
    this.status = status;
  }
}

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
    // Deliberately no subject here: one-time sign-in codes ride in email
    // subjects (B1) and codes must never appear in logs.
    console.log("[resend] sending to:", payload.to);
  }

  const body: Record<string, unknown> = {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
  };
  if (payload.html) body.html = payload.html;
  if (payload.text) body.text = payload.text;
  if (payload.reply_to) body.reply_to = payload.reply_to;

  // RESEND_BASE_URL is a test seam: unset in production (and in wrangler.toml)
  // so real sends always hit Resend; the isolated-DB harness points it at a
  // local sink so end-to-end signup tests capture real rendered emails
  // without any outbound mail.
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
  };
  if (payload.idempotencyKey) headers["Idempotency-Key"] = payload.idempotencyKey;

  const response = await fetch(`${env.RESEND_BASE_URL ?? "https://api.resend.com"}/emails`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const errorData = (responseBody ?? {}) as ResendError;
    const message = errorData?.message
      ? `Resend request failed: ${errorData.message}`
      : `Resend request failed with status ${response.status}`;
    console.error("[resend] error response:", JSON.stringify(responseBody));
    throw new ResendHttpError(message, response.status);
  }

  if (isDev) {
    console.log("[resend] success response:", JSON.stringify(responseBody));
  }
  return responseBody;
};
