"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import * as React from "react";
import AuthField from "./AuthField";

type AuthDividerFormProps = {
  /** Text shown in the divider, e.g. "or sign in with" or "or sign up with" */
  dividerText: string;
  /** Form content; first AuthField child gets noTopMargin automatically */
  children: React.ReactNode;
  /** Form submit handler; when provided, inner container renders as form */
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
};

/**
 * Wraps the "or sign in/up with" divider and form in consistent spacing.
 * Groups divider + form as a single unit so parent Stack spacing does not add
 * extra gap above the first field. Uses 16px (theme spacing 2) between
 * divider and form; injects noTopMargin into the first AuthField child.
 */
export default function AuthDividerForm({
  dividerText,
  children,
  onSubmit,
}: AuthDividerFormProps) {
  const processedChildren = React.Children.map(children, (child, index) => {
    if (
      index === 0 &&
      React.isValidElement(child) &&
      child.type === AuthField
    ) {
      return React.cloneElement(child as React.ReactElement<{ noTopMargin?: boolean }>, {
        noTopMargin: true,
      });
    }
    return child;
  });

  const FormWrapper = onSubmit ? "form" : React.Fragment;
  const formProps = onSubmit ? { onSubmit } : {};

  return (
    <Stack spacing={2}>
      {/* An empty dividerText opts out of the rule entirely (login flows
          the fields straight under Google with no "or" chrome). */}
      {dividerText ? (
        <Box sx={{ mt: 2.5 }}>
          <Divider sx={{ "&::before, &::after": { borderColor: "divider" } }}>
            <Typography
              variant="body2"
              fontWeight={500}
              color="text.secondary"
              component="span"
              sx={{ px: 2, fontSize: "0.8125rem" }}
            >
              {dividerText}
            </Typography>
          </Divider>
        </Box>
      ) : (
        <Box sx={{ mt: 0.5 }} />
      )}

      <FormWrapper {...formProps}>
        <Stack spacing={0}>
          {processedChildren}
        </Stack>
      </FormWrapper>
    </Stack>
  );
}
