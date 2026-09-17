import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

/** Visually hidden text for screen readers. Pixel strings on purpose: in sx a bare 1 means 100%. */
export const srOnly = { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

/** A card section's heading: a tinted icon disc, the title, and an optional caption. */
export function IconTitle({ icon, title, caption }: { icon: React.ReactNode; title: string; caption?: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
      <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" component="h2" fontWeight={800} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>{title}</Typography>
        {caption && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{caption}</Typography>}
      </Box>
    </Stack>
  );
}

/** A stat tile: label, value in proportional figures, and a short line under it. */
export function StatTile({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: { xs: 1, sm: 1.5 }, py: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontWeight: 700, lineHeight: 1.3 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.25rem", sm: "1.625rem" }, lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>{sub}</Typography>
    </Box>
  );
}

/**
 * The way back from a challenge page to its group (or a season page), placed
 * under the page's title and intro instead of on a row of its own. It is the
 * same quiet outlined button as the community header's Edit, with the name
 * cut short on narrow screens.
 */
export function BackButton({ href, label, onClick }: { href: string; label: string; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Button
      component={NextLink}
      href={href}
      onClick={onClick}
      variant="outlined"
      size="small"
      startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />}
      sx={{
        textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "divider", color: "text.secondary", maxWidth: "100%", minHeight: 36, boxShadow: "none",
        "&:hover": { borderColor: "text.disabled", bgcolor: "action.hover", boxShadow: "none" },
      }}
    >
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{label}</Box>
    </Button>
  );
}

const NOTICE_TONE = {
  neutral: { disc: "primary.light", icon: "primary.main" },
  success: { disc: "success.light", icon: "success.main" },
  warning: { disc: "warning.light", icon: "warning.dark" },
  error: { disc: "error.light", icon: "error.dark" },
} as const;

/**
 * A short notice in the app's own style, in place of MUI's tinted alerts: a
 * soft bordered panel with the tinted icon disc used by card headings, plain
 * text, and an optional action and close button on the right.
 */
export function Notice({
  tone = "neutral",
  icon,
  children,
  action,
  onClose,
  role,
}: {
  tone?: keyof typeof NOTICE_TONE;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
  role?: "status" | "alert";
}) {
  const colors = NOTICE_TONE[tone];
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      role={role}
      sx={{ px: 1.5, py: 1.25, borderRadius: 2.5, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
    >
      <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: colors.disc, color: colors.icon, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, "& svg": { fontSize: 18 } }}>
        {icon}
      </Box>
      <Typography component="div" variant="body2" sx={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>{children}</Typography>
      {action}
      {onClose && (
        <IconButton aria-label="Dismiss" size="small" onClick={onClose} sx={{ color: "text.secondary", flexShrink: 0 }}>
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}
    </Stack>
  );
}
