import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const runtime = "edge";

export default async function ProtectedPage() {
  const session = await auth();

  if (!session) {
    redirect("/login?callbackUrl=%2Fprotected");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Protected</h1>
      <p>Access granted.</p>
      <pre>{JSON.stringify(session, null, 2)}</pre>
    </main>
  );
}
