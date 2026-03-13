/**
 * Media upload pipeline: short-lived JWT tokens, R2 storage.
 * Reusable for avatar, event images, etc.
 */

import { SignJWT, jwtVerify } from "jose";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_EVENT_BANNER_BYTES = 400 * 1024; // 400KB

export type MediaPurpose = "avatar" | "event_banner";
const ALLOWED_PURPOSES: MediaPurpose[] = ["avatar", "event_banner"];

export type UploadTokenPayload = {
  userId: string;
  objectKey: string;
  purpose: MediaPurpose;
  contentType: string;
  contentLength: number;
  exp: number;
};

function getExtFromContentType(ct: string): string {
  if (ct === "image/jpeg" || ct === "image/jpg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  return "bin";
}

export function validateMediaInit(
  purpose: string,
  contentType: string,
  contentLength: number,
): { ok: boolean; error?: string } {
  if (!ALLOWED_PURPOSES.includes(purpose as MediaPurpose)) {
    return { ok: false, error: "Invalid purpose" };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(contentType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { ok: false, error: "Allowed types: JPEG, PNG, WebP" };
  }
  const maxBytes = purpose === "event_banner" ? MAX_EVENT_BANNER_BYTES : MAX_AVATAR_BYTES;
  if (contentLength > maxBytes) {
    return { ok: false, error: purpose === "event_banner" ? "Banner must be 400KB or less" : "Avatar must be 2MB or less" };
  }
  if (contentLength <= 0) {
    return { ok: false, error: "Invalid file size" };
  }
  return { ok: true };
}

export function buildObjectKey(userId: string, purpose: MediaPurpose, contentType: string): string {
  const ext = getExtFromContentType(contentType);
  const ts = Date.now();
  if (purpose === "avatar") {
    return `avatars/${userId}/${ts}.${ext}`;
  }
  if (purpose === "event_banner") {
    return `event_banners/${userId}/${ts}.${ext}`;
  }
  return `${purpose}s/${userId}/${ts}.${ext}`;
}

export async function createUploadToken(
  payload: Omit<UploadTokenPayload, "exp">,
  secret: string,
  expiresInSeconds = 600,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const token = await new SignJWT({ ...payload, exp })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
  return token;
}

export async function verifyUploadToken(
  token: string,
  secret: string,
): Promise<UploadTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    return payload as unknown as UploadTokenPayload;
  } catch {
    return null;
  }
}
