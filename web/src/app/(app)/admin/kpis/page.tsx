import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import AdminKPIsClient from "./AdminKPIsClient";

export const metadata: Metadata = {
  title: "KPIs | NewChums Admin",
};

export default async function AdminKPIsPage() {
  const session = await auth();
  const email = (session?.user as { email?: string })?.email;
  if (!email) notFound();

  const rows = (await sql`
    SELECT role FROM users WHERE email = ${email} LIMIT 1
  `) as { role: string | null }[];

  if (rows.length === 0 || rows[0].role !== "super_admin") {
    notFound();
  }

  return <AdminKPIsClient />;
}
