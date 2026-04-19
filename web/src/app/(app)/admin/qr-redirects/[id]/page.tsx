import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import AdminQrRedirectDetailClient from "./AdminQrRedirectDetailClient";

export const metadata: Metadata = {
  title: "QR Code Detail | NewChums",
};

export default async function AdminQrRedirectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const email = (session?.user as { email?: string })?.email;
  if (!email) notFound();

  const rows = (await sql`
    SELECT role FROM users WHERE email = ${email} LIMIT 1
  `) as { role: string | null }[];

  if (rows.length === 0 || rows[0].role !== "super_admin") {
    notFound();
  }

  const { id } = await params;
  return <AdminQrRedirectDetailClient id={id} />;
}
