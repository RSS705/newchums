"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

type OnboardingProgressProps = {
  currentStep: number;
  totalSteps: number;
};

export default function OnboardingProgress({
  currentStep,
  totalSteps,
}: OnboardingProgressProps) {
  const progress = ((currentStep) / totalSteps) * 100;

  return (
    <Box sx={{ width: "100%", mb: 1 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 0.75, fontSize: "0.8125rem", fontWeight: 500 }}
      >
        Step {currentStep} of {totalSteps}
      </Typography>
      <Box
        sx={{
          width: "100%",
          height: 4,
          borderRadius: 2,
          bgcolor: "grey.200",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: 2,
            bgcolor: "primary.main",
            transition: "width 0.4s ease",
          }}
        />
      </Box>
    </Box>
  );
}
