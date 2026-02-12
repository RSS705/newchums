import { notFound } from "next/navigation";
import SentryTestClient from "./SentryTestClient";

export default function SentryTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <SentryTestClient />;
}
