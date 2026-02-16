import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export default function ThemeTestPage() {
  return (
    <Box sx={{ p: 4 }}>
      <Stack spacing={3} maxWidth={720}>
        <Typography variant="h2">NewChums Theme Test</Typography>
        <Typography color="text.secondary">
          Verify coral primary, teal secondary, typography, and component rounding.
        </Typography>

        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="primary">Primary CTA</Button>
          <Button variant="contained" color="secondary">Secondary</Button>
          <Button variant="outlined" color="primary">Outlined</Button>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Chip label="Primary" color="primary" />
          <Chip label="Secondary" color="secondary" />
        </Stack>

        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 1 }}>Card Title</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Card + text colors + divider/border should feel clean.
            </Typography>
            <TextField fullWidth label="Email" placeholder="you@newchums.com" />
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
