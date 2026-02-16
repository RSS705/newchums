import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { redirectIfAuthenticated } from "@/lib/auth/routeGuards";

export const runtime = "edge";

export default async function LoginPage() {
  await redirectIfAuthenticated("/home");

  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading...</main>}>
      <LoginClient />
    </Suspense>
  );
}
