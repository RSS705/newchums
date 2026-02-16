import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type NCCardProps = {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
};

export default function NCCard({ children, title, subtitle, action }: NCCardProps) {
  return (
    <Card>
      <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
        {(title || subtitle || action) && (
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={2}
            mb={2}
          >
            <Stack spacing={0.5}>
              {typeof title === "string" ? <Typography variant="h6">{title}</Typography> : title}
              {typeof subtitle === "string" ? (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              ) : (
                subtitle
              )}
            </Stack>
            {action}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

