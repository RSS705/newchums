import { Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";

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
