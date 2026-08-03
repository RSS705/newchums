import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import UIDemoClient from "./UIDemoClient";

export const metadata: Metadata = {
  title: "UI Validation | NewChums",
};

/**
 * Developer component gallery. Renders no real data, but it is a workbench,
 * not a product surface, so it is super-admin-gated the same way the admin
 * pages are (URL kept, audience narrowed, like the roadmap gating). Everyone
 * else gets the 404 page rather than a redirect, so the URL's existence is
 * not advertised.
 */
export default async function UIPage() {
  const session = await auth();
  const email = (session?.user as { email?: string })?.email;
  if (!email) notFound();

  const rows = (await sql`
    SELECT role FROM users WHERE email = ${email} LIMIT 1
  `) as { role: string | null }[];

  if (rows.length === 0 || rows[0].role !== "super_admin") {
    notFound();
  }

  return <UIDemoClient />;
}
