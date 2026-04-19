import type { useToast } from "@/components/ui";

type ToastApi = ReturnType<typeof useToast>;

/** Build the canonical public QR URL for a code. Runs only in the browser
 *  so we can use `window.location.origin` — the server doesn't need to
 *  build this URL because the detail page renders the resolved value after
 *  hydration. Returns a plain "/qr/CODE" path on the server as a safe
 *  fallback for SSR. */
export function qrPublicUrlFor(code: string): string {
  const path = `/qr/${encodeURIComponent(code)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export async function copyQrPublicUrl(
  code: string,
  toast: ToastApi,
): Promise<void> {
  const url = qrPublicUrlFor(code);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("QR URL copied to clipboard");
  } catch {
    toast.error("Could not copy QR URL");
  }
}

export function formatQrScanWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
