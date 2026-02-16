import type { Metadata } from "next";
import StubPage from "@/components/layout/StubPage";

export const metadata: Metadata = {
  title: "Profile | NewChums",
};

export default function ProfilePage() {
  return <StubPage title="Profile" description="Your profile and personal details will be managed here." />;
}
