import type { Metadata } from "next";
import EditCommunityClient from "./EditCommunityClient";

export const metadata: Metadata = {
  title: "Edit Community | NewChums",
};

export default function EditCommunityPage() {
  return <EditCommunityClient />;
}
