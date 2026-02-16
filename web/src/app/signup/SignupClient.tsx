"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function SignupClient() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  return (
    <main style={{ padding: 24 }}>
      <h1>Sign up</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setIsSubmitting(true);
          try {
            const response = await fetch("/api/auth/signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email, password }),
            });
            const data = (await response.json()) as { ok: boolean; error?: string };

            if (!response.ok || !data.ok) {
              if (data.error === "EMAIL_EXISTS") {
                setError("Email already exists.");
              } else if (data.error === "INVALID_INPUT") {
                setError("Please provide a valid email and password (8+ chars).");
              } else {
                setError("Sign up failed. Please try again.");
              }
              return;
            }

            router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`);
          } catch {
            setError("Sign up failed. Please try again.");
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <label>
            Name{" "}
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
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
        <div style={{ marginBottom: 8 }}>
          <label>
            Password{" "}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create account"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </main>
  );
}

