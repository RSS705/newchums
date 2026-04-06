import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

export default function AppLoading() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh",
      }}
    >
      <CircularProgress size={32} sx={{ color: "text.disabled" }} />
    </Box>
  );
}
