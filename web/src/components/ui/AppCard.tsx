import Card, { type CardProps } from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import type { ReactNode } from "react";

type AppCardProps = CardProps & {
  children: ReactNode;
};

export default function AppCard({ children, ...props }: AppCardProps) {
  return (
    <Card {...props}>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
