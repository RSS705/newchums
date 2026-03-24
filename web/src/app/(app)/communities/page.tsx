import type { Metadata } from "next";
import CommunitiesListClient from "./CommunitiesListClient";

export const metadata: Metadata = {
  title: "Communities | NewChums",
};

export default function CommunitiesPage() {
  return <CommunitiesListClient />;
}
