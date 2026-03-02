"use client";

import Avatar from "@mui/material/Avatar";
import type { SxProps, Theme } from "@mui/material/styles";

/** Curated palette for avatar initials; includes NewChums golden accent. */
const AVATAR_PALETTE = [
  { bg: "#F4B400", text: "#1a1a1a" }, // Golden (NewChums accent)
  { bg: "#E8F4EA", text: "#1a5c2e" }, // Soft green
  { bg: "#E3F2FD", text: "#1a4d8f" }, // Soft blue
  { bg: "#F3E5F5", text: "#5c1a6b" }, // Soft purple
  { bg: "#FFF3E0", text: "#b45309" }, // Soft orange
  { bg: "#FCE4EC", text: "#9e1946" }, // Soft pink
  { bg: "#E0F7FA", text: "#006064" }, // Soft cyan
  { bg: "#FFF8E1", text: "#7a5c00" }, // Soft amber
] as const;

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getAvatarColors(userId?: string | null, username?: string | null): { bg: string; text: string } {
  const seed = (userId ?? username ?? "").trim() || "0";
  const idx = hash(seed) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

export type UserAvatarProps = {
  /** URL to avatar image (e.g. from API /users/:id/avatar) */
  src?: string | null;
  /** Display name - first letter used as fallback when no src */
  name?: string | null;
  /** Username/handle - used as fallback when no name; also for deterministic color */
  username?: string | null;
  /** User ID for deterministic color when no src (optional; falls back to username) */
  userId?: string | null;
  size?: number | "small" | "medium" | "large";
  /** When provided and no src, render this instead of the initial letter */
  fallbackIcon?: React.ReactNode;
  sx?: SxProps<Theme>;
};

function getInitial(name?: string | null, username?: string | null): string {
  const fromName = name?.trim().slice(0, 1);
  if (fromName) return fromName.toUpperCase();
  const fromHandle = username?.replace(/^@/, "").trim().slice(0, 1);
  if (fromHandle) return fromHandle.toUpperCase();
  return "?";
}

export default function UserAvatar({
  src,
  name,
  username,
  userId,
  size,
  fallbackIcon,
  sx = {},
}: UserAvatarProps) {
  const initial = getInitial(name, username);
  const colors = getAvatarColors(userId, username);
  const sizeNum =
    typeof size === "number"
      ? size
      : size === "small"
        ? 40
        : size === "large"
          ? 128
          : 96;

  const showFallbackIcon = !src && fallbackIcon != null;

  return (
    <Avatar
      src={src ?? undefined}
      sx={{
        width: sizeNum,
        height: sizeNum,
        fontSize: sizeNum * 0.45,
        fontWeight: 600,
        bgcolor: src ? "transparent" : colors.bg,
        color: src ? undefined : colors.text,
        border: "2px solid",
        borderColor: "divider",
        objectFit: "cover",
        "& img": { objectFit: "cover" },
        ...sx,
      }}
    >
      {showFallbackIcon ? fallbackIcon : !src ? initial : null}
    </Avatar>
  );
}
