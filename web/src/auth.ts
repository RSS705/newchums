import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
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
          SELECT id, email, name, password_hash
          FROM users
          WHERE email = ${email}
          LIMIT 1
        `) as { id: string; email: string; name: string | null; password_hash: string | null }[];

        const user = rows[0];
        if (!user || !user.password_hash) return null;

        const isValid = await compare(password, user.password_hash);
        if (!isValid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
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
        return `${baseUrl}/home`;
      }

      return `${baseUrl}/home`;
    },
  },
});
