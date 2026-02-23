import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppButton, AppCard } from "@/components/ui";

type StubPageProps = {
  title: string;
  description: string;
};

export default function StubPage({ title, description }: StubPageProps) {
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h3">
        {title}
      </Typography>
      <Typography color="text.secondary">{description}</Typography>
      <AppCard>
        <Stack spacing={1.5}>
          <Typography variant="h6">Stub - coming next</Typography>
          <Typography color="text.secondary">
            This route is wired into the shell and ready for real feature work.
          </Typography>
          <Stack direction="row" spacing={1.25}>
            <AppButton>Primary action</AppButton>
            <AppButton variant="outlined">Secondary action</AppButton>
          </Stack>
        </Stack>
      </AppCard>
    </Stack>
  );
}
