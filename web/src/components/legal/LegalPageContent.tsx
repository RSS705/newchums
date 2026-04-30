"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
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
        {/* Header. Warm-wash hero matching the rest of the polished
            surfaces (Explore, Your Plans, Communities, Your Chums,
            Profile, Settings, Roadmap, Contact, Safety Center,
            How It Works, Homepage). Eyebrow + large H1 mirror the
            discovery-header pattern in docs/UI_Patterns.md. The two
            date lines (Effective / Last Updated) sit beneath the H1
            as a small metadata row, so the page still opens with all
            the legally relevant context up top. */}
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 3.5 },
            borderRadius: 4,
            borderColor: "primary.light",
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
            mb: { xs: 3, sm: 4 },
          }}
        >
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <GavelRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
              </Box>
              <Typography
                sx={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "primary.dark",
                }}
              >
                Legal
              </Typography>
            </Stack>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "1.875rem", sm: "2.375rem" },
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                color: "text.primary",
              }}
            >
              {title}
            </Typography>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0.25, sm: 2 }}
              sx={{ mt: 0.25 }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                {effectiveDateLine}
              </Typography>
              <Typography
                variant="body2"
                color="text.disabled"
                sx={{ display: { xs: "none", sm: "inline" }, fontSize: "0.8125rem" }}
              >
                ·
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                {lastUpdatedLine}
              </Typography>
            </Stack>
          </Stack>
        </Paper>

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
