import SignupClient from "./SignupClient";
import { redirectIfAuthenticated } from "@/lib/auth/routeGuards";

export const runtime = "edge";

export default async function SignupPage() {
  await redirectIfAuthenticated("/home");
  return <SignupClient />;
}

