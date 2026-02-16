import { auth } from "@/auth";
import { redirect } from "next/navigation";

function buildNextParam(pathname: string, searchParams?: URLSearchParams | string) {
  const query =
    typeof searchParams === "string"
      ? searchParams
      : searchParams
        ? searchParams.toString()
        : "";
  return query ? `${pathname}?${query}` : pathname;
}

export async function requireAuth(pathname: string, searchParams?: URLSearchParams | string) {
  const session = await auth();
  if (!session) {
    const next = encodeURIComponent(buildNextParam(pathname, searchParams));
    redirect(`/login?next=${next}`);
  }
  return session;
}

export async function redirectIfAuthenticated(destination = "/home") {
  const session = await auth();
  if (session) {
    redirect(destination);
  }
}

