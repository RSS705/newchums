import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import ScienceOfFriendshipContent from "./ScienceOfFriendshipContent";

export const metadata: Metadata = {
  title: "The Science of Friendship | NewChums",
  description:
    "Friendship isn't just luck. Learn how proximity, repetition, and disclosure help people connect, and how NewChums recreates those conditions.",
};

export default async function ScienceOfFriendshipPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.email);

  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <ScienceOfFriendshipContent isLoggedIn={isLoggedIn} />
    </LandingLayout>
  );
}
