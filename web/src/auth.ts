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
          SELECT id, email, name, password_hash, email_verified_at, is_suspended
          FROM users
          WHERE email = ${email}
          LIMIT 1
        `) as { id: string; email: string; name: string | null; password_hash: string | null; email_verified_at: string | null; is_suspended: boolean }[];

        const user = rows[0];
        if (!user) {
          const err = new CredentialsSignin("No account found with this email.");
          err.code = "EmailNotFound";
          throw err;
        }
        if (!user.password_hash) {
          const err = new CredentialsSignin("Sign in with Google instead.");
          err.code = "OAuthAccount";
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
