"use client";

import * as React from "react";

type RequestResponse = { ok: boolean; resetUrl?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [resetUrl, setResetUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <main style={{ padding: 24 }}>
      <h1>Forgot password</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setSubmitted(false);
          setResetUrl(null);
          try {
            const response = await fetch("/api/auth/password-reset/request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });
            const data = (await response.json()) as RequestResponse;
            if (!response.ok || !data.ok) {
              setError("Something went wrong. Please try again.");
              return;
            }
            setSubmitted(true);
            if (data.resetUrl) {
              setResetUrl(data.resetUrl);
            }
          } catch {
            setError("Something went wrong. Please try again.");
          }
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <label>
            Email{" "}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit">Send reset link</button>
      </form>
      {submitted && <p>If an account exists, a reset link has been sent.</p>}
      {resetUrl && (
        <p>
          Dev reset link:{" "}
          <a href={resetUrl} target="_blank" rel="noreferrer">
            {resetUrl}
          </a>
        </p>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
