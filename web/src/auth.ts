import NextAuth, { CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { sql } from "./lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailRaw = credentials?.email;
        const passwordRaw = credentials?.password;

        if (typeof emailRaw !== "string" || typeof passwordRaw !== "string") return null;

        const email = emailRaw.trim().toLowerCase();
        const password = passwordRaw;

        if (!email || !password) return null;

        const rows = (await sql`
          SELECT id, email, name, password_hash, password_setup_pending, email_verified_at, is_suspended
          FROM users
          WHERE email = ${email}
          LIMIT 1
        `) as { id: string; email: string; name: string | null; password_hash: string | null; password_setup_pending: boolean | null; email_verified_at: string | null; is_suspended: boolean }[];

        const user = rows[0];
        if (!user) {
          const err = new CredentialsSignin("No account found with this email.");
          err.code = "EmailNotFound";
          throw err;
        }
        if (!user.password_hash) {
          // Disambiguate two states that look the same at the column level:
          //
          //   1. password_setup_pending = TRUE: lightweight-signup user who
          //      never set a password. The login page should offer them a
          //      one-click sign-in link instead of a dead-end error.
          //   2. Otherwise: Google-OAuth-only account (or an older account
          //      that never went through lightweight signup). Steer them
          //      to Google or "Forgot password" which doubles as set-a-password.
          if (user.password_setup_pending) {
            const err = new CredentialsSignin("Your password hasn't been set yet. We're sending a one-click sign-in link to your email so you can finish setup.");
            err.code = "PasswordSetupPending";
            throw err;
          }
          const err = new CredentialsSignin("This account doesn't have a password yet. Use 'Forgot password' to set one, or sign in with Google.");
          err.code = "NoPasswordOnFile";
          throw err;
        }

        const isValid = compareSync(password, user.password_hash);
        if (!isValid) {
          const err = new CredentialsSignin("Incorrect password.");
          err.code = "InvalidPassword";
          throw err;
        }

        if (!user.email_verified_at) {
          const err = new CredentialsSignin("Please verify your email before signing in.");
          err.code = "EmailNotVerified";
          throw err;
        }

        if (user.is_suspended) {
          const err = new CredentialsSignin("Your account has been suspended. Please contact support.");
          err.code = "AccountSuspended";
          throw err;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    /**
     * Magic-link provider for lightweight plan-signup flow.
     *
     * Clients call signIn("magic-link", { email, token, ... }). The authorize
     * callback POSTs to the API's /auth/magic-link/consume which atomically
     * marks the one-time token used, flips email_verified_at if needed, and
     * returns the user record. The API is the source of truth for token
     * validation; this provider is a thin bridge that converts the successful
     * response into a NextAuth session.
     */
    Credentials({
      id: "magic-link",
      name: "Magic Link",
      credentials: {
        email: { label: "Email", type: "email" },
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const emailRaw = credentials?.email;
        const tokenRaw = credentials?.token;
        if (typeof emailRaw !== "string" || typeof tokenRaw !== "string") return null;

        const email = emailRaw.trim().toLowerCase();
        const token = tokenRaw.trim();
        if (!email || !token) return null;

        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!apiBase) {
          console.error("[magic-link] NEXT_PUBLIC_API_BASE_URL not configured");
          const err = new CredentialsSignin("Verification service unavailable. Please try again later.");
          err.code = "MagicLinkInvalid";
          throw err;
        }

        let res: Response;
        try {
          res = await fetch(`${apiBase}/auth/magic-link/consume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, token }),
          });
        } catch {
          const err = new CredentialsSignin("Verification service unavailable. Please try again later.");
          err.code = "MagicLinkInvalid";
          throw err;
        }

        const data = (await res.json().catch(() => null)) as
          | { ok: true; user: { id: string; email: string; name: string | null } }
          | { ok: false; error?: string }
          | null;
        if (!data || !("ok" in data)) {
          const err = new CredentialsSignin("This link is no longer valid. Please request a new one.");
          err.code = "MagicLinkInvalid";
          throw err;
        }
        if (!data.ok) {
          if (data.error === "ACCOUNT_SUSPENDED") {
            const err = new CredentialsSignin("Your account has been suspended. Please contact support.");
            err.code = "MagicLinkAccountSuspended";
            throw err;
          }
          // INVALID_OR_EXPIRED and anything else we don't recognise.
          const err = new CredentialsSignin("This link has expired or already been used. Please request a new one.");
          err.code = "MagicLinkExpired";
          throw err;
        }

        return { id: data.user.id, email: data.user.email, name: data.user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const email = user.email.trim().toLowerCase();
        const rows = (await sql`
          SELECT is_suspended FROM users WHERE email = ${email} LIMIT 1
        `) as { is_suspended: boolean }[];
        if (rows[0]?.is_suspended) {
          return "/login?error=AccountSuspended";
        }
      }
      return true;
    },
    jwt({ token, user, account }) {
      if (user?.id) token.id = user.id;
      if (account?.provider) (token as { provider?: string }).provider = account.provider;
      return token;
    },
    session({ session, token }) {
      if (session?.user) (session.user as { id?: string }).id = (token.id ?? token.sub) as string;
      if ((token as { provider?: string }).provider) {
        (session as { provider?: string }).provider = (token as { provider?: string }).provider;
      }
      return session;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.origin === baseUrl) {
          return url;
        }
      } catch {
        return `${baseUrl}/`;
      }

      return `${baseUrl}/`;
    },
  },
});
