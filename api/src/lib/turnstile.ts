/**
 * Cloudflare Turnstile server-side verification.
 * POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

export type TurnstileVerifyResult = {
  success: boolean;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteip?: string | null
): Promise<TurnstileVerifyResult> {
  const body: Record<string, string> = {
    secret,
    response: token,
  };
  if (remoteip) body.remoteip = remoteip;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as TurnstileVerifyResult;
  return data;
}
