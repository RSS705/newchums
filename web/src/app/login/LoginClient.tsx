"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl") || "/me";
  const emailPrefill = searchParams.get("email");

  React.useEffect(() => {
    if (emailPrefill) {
      setEmail(emailPrefill);
    }
  }, [emailPrefill]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Login</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
            callbackUrl,
          });
          if (result?.error) {
            setError("Invalid email or password.");
            return;
          }
          const nextUrl = result?.url || callbackUrl;
          router.push(nextUrl);
        }}
        style={{ marginBottom: 16 }}
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
        <button type="submit">Sign in with Email</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
      <p>
        <a href="/signup">Create an account</a>
      </p>
      <p>
        <a href="/forgot-password">Forgot password?</a>
      </p>
      <button onClick={() => signIn("google", { callbackUrl: "/me" })}>
        Continue with Google
      </button>
    </main>
  );
}
