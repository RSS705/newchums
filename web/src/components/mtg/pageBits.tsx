import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

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
