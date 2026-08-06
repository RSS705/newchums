"use client";

import { apiFetch } from "@/lib/apiClient";

/**
 * First-touch acquisition attribution (docs/Growth_Experiment_Plan.md §6.2).
 *
 * `captureAttributionLanding()` runs on every public page load and remembers
 * the FIRST interesting arrival in localStorage: UTM parameters (ads,
 * community posts) or a share/invite-linked plan visit. First touch wins;
 * later loads never overwrite it.
 *
 * `reportAttribution()` runs once the visitor is signed in and hands the
 * stored touch to POST /me/attribution, which stamps it only onto a young,
 * still-unattributed account. The server-side invite/share stamp inside
 * GET /events/:id is authoritative and usually wins the race; this path
 * exists for arrivals the server can't see, chiefly ad clicks that go
 * through an OAuth redirect and lose their query string.
 *
 * localStorage rather than a cookie: it survives the OAuth round trip on
 * the same browser, needs no consent-relevant server transmission until
 * the user actually has an account, and this is research plumbing, not
 * tracking across sites.
 */

const KEY = "nc_attrib";
const SENT_KEY = "nc_attrib_sent";

type StoredAttribution = {
  v: 1;
  ts: number;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  };
  landing?: string;
  origin_event_id?: string;
};

export function captureAttributionLanding(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY)) return; // first touch wins

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source")?.trim();
    const planMatch = window.location.pathname.match(
      /^\/(?:events|sample-plan)\/([0-9a-f-]{36})/i,
    );
    const hasShareCtx =
      !!planMatch &&
      window.location.pathname.startsWith("/events/") &&
      (params.has("share_token") || params.has("invite_token"));

    // Only store when there is something attributable; a plain organic
    // landing is stamped as such at report time from the absence of a
    // stored touch, so storage stays empty for most visitors.
    if (!utmSource && !hasShareCtx) return;

    const record: StoredAttribution = {
      v: 1,
      ts: Date.now(),
      landing: window.location.pathname.slice(0, 200),
    };
    if (utmSource) {
      record.utm = {
        source: utmSource,
        medium: params.get("utm_medium")?.trim() || undefined,
        campaign: params.get("utm_campaign")?.trim() || undefined,
        content: params.get("utm_content")?.trim() || undefined,
      };
    }
    if (hasShareCtx && planMatch) {
      record.origin_event_id = planMatch[1];
    }
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable (private mode etc.); attribution just degrades */
  }
}

export async function reportAttribution(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(SENT_KEY)) return;
    const raw = window.localStorage.getItem(KEY);
    // Nothing stored means an organic arrival; report that too, once, so
    // the account gets attribution_method='organic' rather than staying
    // ambiguous with pre-experiment accounts.
    const stored: StoredAttribution | null = raw ? JSON.parse(raw) : null;

    const res = await apiFetch("/me/attribution", {
      method: "POST",
      auth: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utm: stored?.utm ?? undefined,
        landing: stored?.landing ?? window.location.pathname.slice(0, 200),
        origin_event_id: stored?.origin_event_id ?? undefined,
      }),
    });
    if (res.ok) {
      window.localStorage.setItem(SENT_KEY, "1");
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* retried on a later page load */
  }
}
