import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";

const SUSPENDED_CODES = new Set([
  // Query-param values (from Next-Auth redirect / OAuth callback)
  "AccountSuspended",
  "OAuthAccountSuspended",
  "UserSuspended",
  // API error codes returned from the worker
  "EMAIL_SUSPENDED",
  "USER_SUSPENDED",
  "ACCOUNT_SUSPENDED",
]);

type Props = {
  /** Error code from a query param or API response. Renders nothing when null/undefined. */
  code: string | null | undefined;
};

/**
 * Shared banner for auth error states. Currently handles account suspension.
 * Place above the form heading so it is immediately visible on page load.
 */
export default function AuthErrorBanner({ code }: Props) {
  if (!code || !SUSPENDED_CODES.has(code)) return null;

  return (
    <Alert severity="error" sx={{ textAlign: "left" }}>
      <AlertTitle>Account suspended</AlertTitle>
      This account has been disabled. If you believe this is a mistake, please{" "}
      <MuiLink
        component={NextLink}
        href="/contact"
        underline="hover"
        sx={{ fontWeight: 500, color: "inherit" }}
      >
        contact support
      </MuiLink>{" "}
      and include your email address.
    </Alert>
  );
}
