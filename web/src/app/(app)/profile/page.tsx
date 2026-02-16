import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard, NCTextField } from "@/components/ui";

export default function ProfilePage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Profile</Typography>
      <NCCard title="Profile details">
        <Stack spacing={2}>
          <Avatar sx={{ width: 56, height: 56 }}>N</Avatar>
          <NCTextField label="Display name" defaultValue="NewChums User" />
          <NCTextField label="Bio" multiline minRows={3} placeholder="Tell people what you are into." />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NCButton>Save profile</NCButton>
            <NCButton variant="outlined">Cancel</NCButton>
          </Stack>
        </Stack>
      </NCCard>
    </Stack>
  );
}

