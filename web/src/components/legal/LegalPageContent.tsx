"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

const CONTENT_MAX_WIDTH = 800;

type LegalSection = {
  id: string;
  heading: string;
  content: ReactNode;
};

type LegalPageContentProps = {
  title: string;
  effectiveDateLine: string;
  lastUpdatedLine: string;
  intro: ReactNode;
  sections: LegalSection[];
};

export default function LegalPageContent({
  title,
  effectiveDateLine,
  lastUpdatedLine,
  intro,
  sections,
}: LegalPageContentProps) {
  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 6, sm: 8 } }}>
      <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 1, sm: 0 }}>
        <Stack spacing={1} sx={{ mb: { xs: 3, sm: 4 } }}>
          <Typography component="h1" variant="h3" fontWeight={800}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {effectiveDateLine}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {lastUpdatedLine}
          </Typography>
        </Stack>

        <Typography
          variant="body1"
          sx={{ lineHeight: 1.8, mb: { xs: 3, sm: 4 }, color: "text.secondary" }}
        >
          {intro}
        </Typography>

        <Divider sx={{ mb: { xs: 3, sm: 4 } }} />

        <Stack spacing={{ xs: 4, sm: 5 }}>
          {sections.map((section) => (
            <Box key={section.id} component="section" id={section.id}>
              <Typography
                component="h2"
                variant="h6"
                fontWeight={700}
                sx={{ mb: 1.5 }}
              >
                {section.heading}
              </Typography>
              <Box sx={{ "& p": { lineHeight: 1.8, mb: 1.5 }, "& ul": { pl: 2.5, mb: 1.5 }, "& li": { lineHeight: 1.8, mb: 0.5 } }}>
                {section.content}
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
