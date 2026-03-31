/**
 * Contact form submission email template.
 * Branded HTML shell + plain text fallback.
 * All user content is escaped to prevent HTML injection.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape message, then convert newlines to <br/> for display. */
function formatMessageForHtml(message: string): string {
  const escaped = escapeHtml(message);
  return escaped.replace(/\n/g, "<br/>");
}

/** Format ISO timestamp to human-readable (e.g. "Mar 3, 2026, 1:40 PM"). */
function formatTimestampReadable(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export type ContactSubmissionParams = {
  name: string;
  email: string;
  subject: string;
  message: string;
  requestIp: string | null;
  timestamp: string;
  userId?: string;
  username?: string;
  environment?: string;
};

export function renderContactSubmissionHtml(params: ContactSubmissionParams): string {
  const year = new Date().getFullYear();
  const name = escapeHtml(params.name);
  const emailDisplay = escapeHtml(params.email);
  const emailHref = `mailto:${encodeURIComponent(params.email)}`;
  const messageHtml = formatMessageForHtml(params.message);
  const loggedIn = params.userId != null ? "Yes" : "No";
  const username = params.username != null && params.username.trim() !== ""
    ? escapeHtml("@" + params.username.replace(/^@/, "").trim())
    : "N/A";
  const userId = params.userId != null ? escapeHtml(params.userId) : "N/A";
  const ip = params.requestIp ? escapeHtml(params.requestIp) : "N/A";
  const subjectDisplay = escapeHtml(params.subject);
  const envDisplay = escapeHtml(params.environment ?? "N/A");
  const timestampReadable = escapeHtml(formatTimestampReadable(params.timestamp));
  const timestampRaw = escapeHtml(params.timestamp);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NewChums: Contact form submission</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f7fb; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f6f7fb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0b0f19; padding: 20px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="text-align: left; vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff;">NewChums</span>
                    <span style="margin-left: 6px; color: #F4B400; font-size: 18px;">●</span>
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <a href="https://newchums.com/" style="display: inline-block; text-decoration: none; border: 0; outline: none;">
                      <img src="https://newchums.com/images/Icon-White-64.png" alt="" width="40" height="40" style="display: block; width: 40px; height: 40px; border: 0; outline: none; text-decoration: none;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 24px 32px 32px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #111827;">New contact form submission</h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #6B7280;">A new message came in via the Contact page.</p>
              
              <!-- Details section -->
              <h2 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #374151;">Details</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 14px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; width: 140px; color: #6B7280; vertical-align: top;">Subject</td>
                  <td style="padding: 8px 0; color: #111827;">${subjectDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Name</td>
                  <td style="padding: 8px 0; color: #111827;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Email</td>
                  <td style="padding: 8px 0;"><a href="${emailHref}" style="color: #2563EB; text-decoration: none;">${emailDisplay}</a></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Logged in?</td>
                  <td style="padding: 8px 0; color: #111827;">${loggedIn}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Username</td>
                  <td style="padding: 8px 0; color: #111827;">${username}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">User ID</td>
                  <td style="padding: 8px 0; color: #111827;">${userId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">IP address</td>
                  <td style="padding: 8px 0; color: #111827;">${ip}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Environment</td>
                  <td style="padding: 8px 0; color: #111827;">${envDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Submitted at</td>
                  <td style="padding: 8px 0; color: #111827;">${timestampReadable}<br/><span style="font-size: 12px; color: #9CA3AF;">${timestampRaw}</span></td>
                </tr>
              </table>
              
              <!-- Message section -->
              <h2 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #374151;">Message</h2>
              <div style="background-color: #f6f7fb; border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; font-size: 15px; line-height: 1.65; color: #111827; word-break: break-word; overflow-wrap: anywhere;">${messageHtml}</div>
              
              <!-- Quick actions -->
              <p style="margin: 24px 0 0 0; font-size: 13px; color: #6B7280;">Reply to this email to respond to the sender.</p>
              <p style="margin: 8px 0 0 0; font-size: 13px;">
                <a href="${emailHref}" style="color: #2563EB; text-decoration: none;">Reply via mailto → ${emailDisplay}</a>
              </p>
            </td>
          </tr>
          <!-- Footer bar -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f6f7fb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
                <a href="https://newchums.com/contact" style="color: #F4B400; text-decoration: none;">Open contact page</a>
                &nbsp;·&nbsp;
                © ${year} NewChums
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderContactSubmissionText(params: ContactSubmissionParams): string {
  const lines: string[] = [
    "Subject: " + params.subject,
    "Name: " + params.name,
    "Email: " + params.email,
    "Logged in: " + (params.userId != null ? "Yes" : "No"),
    "Username: " + (params.username != null && params.username.trim() !== "" ? "@" + params.username.replace(/^@/, "").trim() : "N/A"),
    "User ID: " + (params.userId ?? "N/A"),
    "IP: " + (params.requestIp ?? "N/A"),
    "Environment: " + (params.environment ?? "N/A"),
    "Timestamp: " + params.timestamp,
    "",
    "Message:",
    params.message,
  ];
  return lines.join("\n");
}
