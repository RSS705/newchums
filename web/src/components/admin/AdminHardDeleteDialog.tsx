"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/toast/ToastProvider";

type SubjectType = "user" | "plan";

type UserImpact = {
  hostedPlans: number;
  rsvps: number;
  confirmations: number;
  chatMessages: number;
  productEventsUser: number;
  productEventsHostedPlans: number;
  communityMemberships: number;
  ownedCommunities: number;
  dmConversations: number;
  tokens: number;
  notifications: number;
};

type PlanImpact = {
  rsvps: number;
  confirmations: number;
  chatMessages: number;
  invites: number;
  altTimes: number;
  joinRequests: number;
  shoutouts: number;
  productEvents: number;
};

type ImpactResponse = {
  ok: boolean;
  target?: { id: string; title?: string; username?: string | null; email?: string; name?: string | null; host?: string };
  blockedReason?: string | null;
  impact?: UserImpact | PlanImpact;
  confirmWith?: string;
  error?: string;
};

type Props = {
  open: boolean;
  subjectType: SubjectType;
  subjectId: string | null;
  /** Display label for the title while the impact preview loads. */
  subjectLabel?: string;
  onClose: () => void;
  onDeleted: () => void;
};

const USER_IMPACT_LABELS: Array<[keyof UserImpact, string]> = [
  ["hostedPlans", "Hosted plans (deleted with everything attached to them)"],
  ["rsvps", "RSVPs"],
  ["confirmations", "Attendance-check confirmations"],
  ["chatMessages", "Chat messages"],
  ["ownedCommunities", "Owned communities (deleted)"],
  ["communityMemberships", "Community memberships"],
  ["dmConversations", "DM conversations"],
  ["productEventsUser", "Funnel analytics rows (user)"],
  ["productEventsHostedPlans", "Funnel analytics rows (their plans)"],
  ["tokens", "Sign-in and verification tokens"],
  ["notifications", "Notifications"],
];

const PLAN_IMPACT_LABELS: Array<[keyof PlanImpact, string]> = [
  ["rsvps", "RSVPs"],
  ["confirmations", "Attendance-check confirmations"],
  ["chatMessages", "Chat messages"],
  ["invites", "Invites"],
  ["altTimes", "Alternate-time suggestions"],
  ["joinRequests", "Join requests"],
  ["shoutouts", "Shout-outs"],
  ["productEvents", "Funnel analytics rows"],
];

/**
 * Typed-confirmation hard delete for test-data hygiene (super admin only).
 * Distinct from the moderation "Remove plan" flow: hard delete sends NO
 * notifications of any kind, removes the subject's funnel analytics rows,
 * and writes an admin_audit record in the same transaction as the cascade.
 */
export default function AdminHardDeleteDialog({
  open,
  subjectType,
  subjectId,
  subjectLabel,
  onClose,
  onDeleted,
}: Props) {
  const toast = useToast();
  const [preview, setPreview] = React.useState<ImpactResponse | null>(null);
  const [confirmText, setConfirmText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const basePath = subjectType === "user" ? "/admin/users" : "/admin/plans";

  React.useEffect(() => {
    if (!open || !subjectId) return;
    let cancelled = false;
    setPreview(null);
    setConfirmText("");
    setError(null);
    apiFetch(`${basePath}/${subjectId}/delete-impact`, { auth: true })
      .then((r) => r.json())
      .then((json: ImpactResponse) => {
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error ?? "Failed to load impact preview");
        setPreview(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load impact preview");
      });
    return () => {
      cancelled = true;
    };
  }, [open, subjectId, basePath]);

  const confirmWith = preview?.confirmWith ?? "";
  const normalizedMatch =
    subjectType === "user"
      ? confirmText.trim().replace(/^@/, "").toLowerCase() === confirmWith.trim().replace(/^@/, "").toLowerCase()
      : confirmText.trim() === confirmWith.trim();
  const blocked = Boolean(preview?.blockedReason);
  const loading = open && !preview && !error;

  const impactRows: Array<[string, number]> = React.useMemo(() => {
    if (!preview?.impact) return [];
    const labels = (subjectType === "user" ? USER_IMPACT_LABELS : PLAN_IMPACT_LABELS) as Array<[string, string]>;
    const impact = preview.impact as unknown as Record<string, number>;
    return labels.map(([key, label]) => [label, impact[key] ?? 0]);
  }, [preview, subjectType]);

  async function handleDelete() {
    if (!subjectId || !normalizedMatch || blocked) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`${basePath}/${subjectId}/hard-delete`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string; message?: string } | null;
      if (!json?.ok) {
        setError(json?.message ?? json?.error ?? "Hard delete failed.");
        return;
      }
      toast.success(subjectType === "user" ? "Account hard-deleted." : "Plan hard-deleted.");
      onDeleted();
      onClose();
    } catch {
      setError("Hard delete failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const titleLabel =
    subjectType === "user"
      ? preview?.target?.username ?? preview?.target?.email ?? subjectLabel ?? "account"
      : preview?.target?.title ?? subjectLabel ?? "plan";

  return (
    <Dialog open={open} onClose={() => { if (!submitting) onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Hard delete {subjectType === "user" ? "account" : "plan"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            Test-data cleanup. Everything below is removed in one transaction, including funnel
            analytics rows, and an audit record is kept. No emails or notifications are sent to
            anyone. This cannot be undone.
          </Alert>

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {error && (
            <Typography variant="body2" color="error" role="status" aria-live="polite">
              {error}
            </Typography>
          )}

          {preview && blocked && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {preview.blockedReason === "TARGET_SELF"
                ? "You cannot hard-delete your own account."
                : "Super admin accounts cannot be hard-deleted."}
            </Alert>
          )}

          {preview && !blocked && (
            <>
              <Typography variant="body2">
                Deleting <strong>{titleLabel}</strong>
                {subjectType === "plan" && preview.target?.host ? (
                  <> (hosted by {preview.target.host})</>
                ) : null}
                {subjectType === "user" && (preview.impact as UserImpact).hostedPlans > 0 ? (
                  <>
                    {" "}
                    including their {(preview.impact as UserImpact).hostedPlans} hosted{" "}
                    {(preview.impact as UserImpact).hostedPlans === 1 ? "plan" : "plans"}
                  </>
                ) : null}
                . Impact:
              </Typography>
              <Box
                component="ul"
                sx={{ m: 0, pl: 2.5, "& li": { fontSize: "0.875rem", lineHeight: 1.7, color: "text.secondary" } }}
              >
                {impactRows.map(([label, count]) => (
                  <li key={label}>
                    {label}: <strong>{count}</strong>
                  </li>
                ))}
              </Box>
              <TextField
                label={`Type "${confirmWith}" to confirm`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                fullWidth
                size="small"
                autoComplete="off"
                disabled={submitting}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleDelete}
          disabled={submitting || !normalizedMatch || blocked || !preview}
        >
          {submitting ? "Deleting..." : "Hard delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
