"use client";

import * as React from "react";
import type { Session } from "next-auth";
import { apiFetch } from "@/lib/apiClient";

/**
 * When user has a Google session, calls API to set email_verified_at
 * (handles Credentials user who later signs in with Google).
 */
export default function MarkOAuthVerified({ session }: { session: Session | null }) {
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (!session?.user) return;
    const provider = (session as { provider?: string }).provider;
    if (provider !== "google") return;
    if (doneRef.current) return;
    doneRef.current = true;

    apiFetch("/auth/email-verify/mark-oauth", {
      method: "POST",
      auth: true,
    }).catch(() => {});
  }, [session]);

  return null;
}
