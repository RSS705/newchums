import Typography from "@mui/material/Typography";

type SectionHeaderProps = {
  title: string;
};

export default function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <Typography component="h2" variant="h6" fontWeight={600} gutterBottom>
      {title}
    </Typography>
  );
}
