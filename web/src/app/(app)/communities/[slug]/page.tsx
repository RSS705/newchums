import type { Metadata } from "next";
import CommunityDetailClient from "./CommunityDetailClient";

export const metadata: Metadata = {
  title: "Community | NewChums",
};

export default function CommunityDetailPage() {
  return <CommunityDetailClient />;
}
