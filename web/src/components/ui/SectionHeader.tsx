import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

type SectionEmphasis = "primary" | "secondary" | "subdued";

export type SectionHeaderProps = {
  title: string;
  emphasis?: SectionEmphasis;
};

/**
 * Reusable section header with accent bar. Use across dashboard, profile, and other pages.
 * Spacing below the header is controlled here for consistent rhythm system-wide.
 */
export default function SectionHeader({ title, emphasis = "secondary" }: SectionHeaderProps) {
  const isPrimary = emphasis === "primary";
  const accentWidth = isPrimary ? 4 : 3;
  const accentColor =
    isPrimary ? "primary.main" : emphasis === "secondary" ? "primary.light" : "grey.300";
  const variant = emphasis === "subdued" ? "h6" : "h5";
  const color = emphasis === "subdued" ? "text.secondary" : "text.primary";
  const fontWeight = isPrimary ? 700 : 600;
  const fontSize =
    isPrimary
      ? { xs: "1.2rem", sm: "1.375rem" }
      : emphasis === "secondary"
        ? { xs: "1.0625rem", sm: "1.125rem" }
        : undefined;

  return (
    <Box
      component="header"
      sx={{
        display: "block",
        mb: { xs: 2, sm: 3 },
      }}
    >
      <Box
        sx={{
          borderLeft: accentWidth,
          borderColor: accentColor,
          pl: 2,
          py: 0.25,
        }}
      >
        <Typography
          component="h2"
          variant={variant}
          fontWeight={fontWeight}
          color={color}
          sx={{ letterSpacing: "-0.015em", ...(fontSize && { fontSize }) }}
        >
          {title}
        </Typography>
      </Box>
    </Box>
  );
}
