"use client";

import Avatar from "@mui/material/Avatar";
import type { SxProps, Theme } from "@mui/material/styles";

/** Avatar initials use NewChums golden accent for consistent, on-brand fallback. */
const AVATAR_INITIALS_COLORS = { bg: "#F4B400", text: "#1a1a1a" } as const;

export type UserAvatarProps = {
  /** URL to avatar image (e.g. from API /users/:id/avatar) */
  src?: string | null;
  /** Display name - first letter used as fallback when no src */
  name?: string | null;
  /** Username/handle - used as fallback when no name */
  username?: string | null;
  /** User ID (optional; unused for color, kept for API compatibility) */
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
  const colors = AVATAR_INITIALS_COLORS;
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
