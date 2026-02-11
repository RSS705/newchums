"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ConfirmResponse = { ok: boolean; error?: string };

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  return (
    <main style={{ padding: 24 }}>
      <h1>Reset password</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          if (!token) {
            setError("Missing reset token.");
            return;
          }
          if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
          }
          setIsSubmitting(true);
          try {
            const response = await fetch("/api/auth/password-reset/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, password }),
            });
            const data = (await response.json()) as ConfirmResponse;
            if (!response.ok || !data.ok) {
              if (data.error === "INVALID_OR_EXPIRED") {
                setError("Reset link is invalid or expired.");
              } else if (data.error === "INVALID_INPUT") {
                setError("Password must be at least 8 characters.");
              } else {
                setError("Unable to reset password.");
              }
              return;
            }
            router.push("/login");
          } catch {
            setError("Unable to reset password.");
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <label>
            New password{" "}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Confirm password{" "}
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Update password"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
