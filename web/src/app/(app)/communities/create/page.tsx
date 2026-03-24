import type { Metadata } from "next";
import CreateCommunityClient from "./CreateCommunityClient";

export const metadata: Metadata = {
  title: "Create a Community | NewChums",
};

export default function CreateCommunityPage() {
  return <CreateCommunityClient />;
}
