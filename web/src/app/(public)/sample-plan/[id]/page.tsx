import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import LandingLayout from "@/components/landing/LandingLayout";
import { getSamplePublicExplorePlans } from "@/lib/publicExploreSamplePlans";
import SamplePlanClient from "./SamplePlanClient";

type PageProps = { params: Promise<{ id: string }> };

/** Sample plans are illustrative, not real content: keep them out of search
 *  so they can never be mistaken for a live plan in results. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const plan = getSamplePublicExplorePlans().find((p) => p.id === id);
  const title = plan ? `Sample plan: ${plan.title}` : "Sample plan";
  return {
    title,
    description:
      "A read-only example of what a plan looks like on NewChums, so you can see the real thing before making your own.",
    robots: { index: false, follow: true },
  };
}

export default async function SamplePlanPage({ params }: PageProps) {
  const { id } = await params;
  const plan = getSamplePublicExplorePlans().find((p) => p.id === id);
  if (!plan) notFound();

  return (
    <LandingLayout isLoggedIn={false}>
      <Box sx={{ py: { xs: 2, sm: 3 } }}>
        <SamplePlanClient plan={plan} />
      </Box>
    </LandingLayout>
  );
}
