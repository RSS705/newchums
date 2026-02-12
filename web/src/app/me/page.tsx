import { auth } from "@/auth";
import LogoutButton from "./LogoutButton";

export const runtime = "edge";

export default async function MePage() {
  const session = await auth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Me</h1>
      <pre>{JSON.stringify(session, null, 2)}</pre>
      {session ? <LogoutButton /> : <p>Not signed in. Go to /login</p>}
    </main>
  );
}
