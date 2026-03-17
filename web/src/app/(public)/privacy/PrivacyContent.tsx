"use client";

import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import LegalPageContent from "@/components/legal/LegalPageContent";

export default function PrivacyContent() {
  return (
    <LegalPageContent
      title="Privacy Policy"
      effectiveDateLine="Effective Date: [MONTH DAY, YEAR]"
      lastUpdatedLine="Last Updated: [MONTH DAY, YEAR]"
      intro={
        <>
          NewChums is operated by <strong>[LEGAL ENTITY NAME / &ldquo;Our Module&rdquo; placeholder]</strong>{" "}
          (&ldquo;NewChums,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          <br /><br />
          This Privacy Policy explains how we collect, use, disclose, and protect personal information
          when you use the NewChums website, apps, features, and related services (collectively, the
          &ldquo;Service&rdquo;).
          <br /><br />
          If you have questions about this Privacy Policy or our privacy practices, you can contact us at:{" "}
          <MuiLink href="mailto:contact@newchums.com" color="primary">contact@newchums.com</MuiLink>
          <br />
          <strong>Mailing Address:</strong> [INSERT BUSINESS OR MAILING ADDRESS]
        </>
      }
      sections={[
        {
          id: "who-can-use",
          heading: "1. Who Can Use NewChums",
          content: (
            <Typography variant="body1">
              NewChums is intended for people who are <strong>18 years of age or older</strong>. By using
              NewChums, you represent that you are at least 18 years old and able to enter into a binding
              agreement with us.
            </Typography>
          ),
        },
        {
          id: "information-we-collect",
          heading: "2. Information We Collect",
          content: (
            <>
              <Typography variant="body1">
                We collect information you provide directly, information generated through your use of the
                Service, and certain information from devices and third-party services.
              </Typography>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                A. Information You Provide to Us
              </Typography>
              <Typography variant="body1">
                Depending on how you use NewChums, this may include:
              </Typography>
              <ul>
                <li><Typography variant="body1">your name, username, email address, password, and account credentials</Typography></li>
                <li><Typography variant="body1">date of birth or age-related information</Typography></li>
                <li><Typography variant="body1">profile information, including hobbies, interests, preferences, and profile images</Typography></li>
                <li><Typography variant="body1">location-related information you provide, such as your city, area, or distance/radius preferences</Typography></li>
                <li><Typography variant="body1">plans, events, descriptions, and other content you create</Typography></li>
                <li><Typography variant="body1">RSVP responses, attendance confirmations, comments, chat messages, and other user content</Typography></li>
                <li><Typography variant="body1">invitations you send or respond to</Typography></li>
                <li><Typography variant="body1">communications you send to us, including support or feedback messages</Typography></li>
              </ul>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                B. Information We Collect Automatically
              </Typography>
              <Typography variant="body1">
                When you use NewChums, we may automatically collect:
              </Typography>
              <ul>
                <li><Typography variant="body1">IP address</Typography></li>
                <li><Typography variant="body1">browser type, device type, operating system, and approximate technical identifiers</Typography></li>
                <li><Typography variant="body1">usage data, such as pages viewed, features used, referring URLs, and timestamps</Typography></li>
                <li><Typography variant="body1">log data relating to account access, security, and service performance</Typography></li>
                <li><Typography variant="body1">cookie, session, and similar technology data</Typography></li>
              </ul>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                C. Information from Third Parties
              </Typography>
              <Typography variant="body1">
                We may receive information from third-party services you use to access or interact with
                NewChums, such as authentication providers, infrastructure providers, analytics providers,
                error logging providers, email providers, or map/location services.
              </Typography>
            </>
          ),
        },
        {
          id: "how-we-use",
          heading: "3. How We Use Personal Information",
          content: (
            <>
              <Typography variant="body1">
                We use personal information to operate, maintain, improve, and protect NewChums, including to:
              </Typography>
              <ul>
                <li><Typography variant="body1">create and manage user accounts</Typography></li>
                <li><Typography variant="body1">authenticate users and maintain account security</Typography></li>
                <li><Typography variant="body1">provide profile, plan, RSVP, attendance assurance, invitation, and chat features</Typography></li>
                <li><Typography variant="body1">facilitate event and plan organization between users</Typography></li>
                <li><Typography variant="body1">send transactional or service-related communications</Typography></li>
                <li><Typography variant="body1">send user-controlled notification emails and reminders</Typography></li>
                <li><Typography variant="body1">provide customer support and respond to inquiries</Typography></li>
                <li><Typography variant="body1">detect, prevent, investigate, and address fraud, abuse, safety issues, and technical problems</Typography></li>
                <li><Typography variant="body1">enforce our Terms of Use and other platform rules</Typography></li>
                <li><Typography variant="body1">improve product design, reliability, moderation, and user experience</Typography></li>
                <li><Typography variant="body1">develop future trust, safety, attendance, and reputation-related systems</Typography></li>
                <li><Typography variant="body1">comply with legal obligations</Typography></li>
              </ul>
            </>
          ),
        },
        {
          id: "visibility",
          heading: "4. Visibility of Information to Other Users",
          content: (
            <>
              <Typography variant="body1">
                NewChums is a social event-planning platform, which means some information is visible to
                other users depending on how you use the Service.
              </Typography>
              <Typography variant="body1">
                For example, other users may be able to see some or all of the following:
              </Typography>
              <ul>
                <li><Typography variant="body1">your username and profile details</Typography></li>
                <li><Typography variant="body1">plans or events you create or join</Typography></li>
                <li><Typography variant="body1">RSVP status or attendance-related responses</Typography></li>
                <li><Typography variant="body1">plan descriptions and related content</Typography></li>
                <li><Typography variant="body1">chat messages and comments within plans</Typography></li>
                <li><Typography variant="body1">information shown on public or semi-public plan detail pages, where applicable</Typography></li>
              </ul>
              <Typography variant="body1">
                Please use care when submitting information to public or shared areas of the Service.
              </Typography>
            </>
          ),
        },
        {
          id: "emails-notifications",
          heading: "5. Emails, Notifications, and Communications",
          content: (
            <>
              <Typography variant="body1">
                We may send you service-related emails and notifications, including account verification,
                password reset, plan invitations, RSVP-related updates, plan changes, unread message digests,
                attendance confirmation requests, safety or moderation notices, and similar service
                communications.
              </Typography>
              <Typography variant="body1">
                Some emails may be optional and controllable through your notification settings or through
                unsubscribe links where applicable. Other emails are necessary to operate the Service or
                manage your account and may not be optional.
              </Typography>
            </>
          ),
        },
        {
          id: "cookies",
          heading: "6. Cookies and Similar Technologies",
          content: (
            <>
              <Typography variant="body1">
                We use cookies, session technologies, and similar tools to operate the Service, keep users
                signed in, remember preferences, analyze traffic, improve reliability, and support security
                and fraud prevention.
              </Typography>
              <Typography variant="body1">
                You may be able to control some cookie behavior through your browser settings. However,
                disabling certain cookies or similar technologies may affect how the Service functions.
              </Typography>
            </>
          ),
        },
        {
          id: "when-we-share",
          heading: "7. When We Share Information",
          content: (
            <>
              <Typography variant="body1">
                We do not sell personal information in the ordinary sense of selling user data for money.
              </Typography>
              <Typography variant="body1">
                We may share information in the following circumstances:
              </Typography>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                A. With Service Providers
              </Typography>
              <Typography variant="body1">
                We may share information with vendors and service providers that help us operate NewChums, such as providers for:
              </Typography>
              <ul>
                <li><Typography variant="body1">hosting and web infrastructure</Typography></li>
                <li><Typography variant="body1">databases and storage</Typography></li>
                <li><Typography variant="body1">email delivery</Typography></li>
                <li><Typography variant="body1">analytics and logging</Typography></li>
                <li><Typography variant="body1">authentication and sign-in</Typography></li>
                <li><Typography variant="body1">maps or location services</Typography></li>
                <li><Typography variant="body1">security, monitoring, and error reporting</Typography></li>
              </ul>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                B. With Other Users
              </Typography>
              <Typography variant="body1">
                We share information with other users as part of the normal operation of the Service, such as
                profile details, event participation, RSVP-related information, attendance confirmation status,
                plan content, and chat content.
              </Typography>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                C. For Legal, Safety, and Platform Integrity Reasons
              </Typography>
              <Typography variant="body1">
                We may disclose information if we believe it is reasonably necessary to:
              </Typography>
              <ul>
                <li><Typography variant="body1">comply with applicable law, regulation, legal process, or governmental request</Typography></li>
                <li><Typography variant="body1">investigate or address fraud, abuse, harassment, safety incidents, or platform misuse</Typography></li>
                <li><Typography variant="body1">protect the rights, property, safety, or security of NewChums, our users, or others</Typography></li>
                <li><Typography variant="body1">enforce our Terms of Use and other policies</Typography></li>
              </ul>

              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                D. Business Transfers
              </Typography>
              <Typography variant="body1">
                If NewChums or its operator is involved in a merger, acquisition, financing, reorganization,
                sale of assets, or similar transaction, personal information may be transferred as part of
                that transaction, subject to applicable law.
              </Typography>
            </>
          ),
        },
        {
          id: "third-party-services",
          heading: "8. Third-Party Services We Use",
          content: (
            <>
              <Typography variant="body1">NewChums may use third-party providers such as:</Typography>
              <ul>
                <li><Typography variant="body1">Cloudflare</Typography></li>
                <li><Typography variant="body1">Neon</Typography></li>
                <li><Typography variant="body1">Postmark</Typography></li>
                <li><Typography variant="body1">Sentry</Typography></li>
                <li><Typography variant="body1">Axiom</Typography></li>
                <li><Typography variant="body1">Google sign-in or similar authentication tools</Typography></li>
                <li><Typography variant="body1">map or places services</Typography></li>
                <li><Typography variant="body1">analytics services, including Google Analytics if implemented</Typography></li>
              </ul>
              <Typography variant="body1">
                These providers may process information on our behalf and may store or process data in
                Canada, the United States, or other jurisdictions.
              </Typography>
            </>
          ),
        },
        {
          id: "data-retention",
          heading: "9. Data Retention",
          content: (
            <>
              <Typography variant="body1">
                We retain personal information for as long as reasonably necessary to operate the Service,
                maintain account functionality, provide support, enforce our policies, comply with legal
                obligations, resolve disputes, and protect the integrity and safety of the platform.
              </Typography>
              <Typography variant="body1">
                Certain information may be retained after account closure or deletion for limited purposes,
                including backups, security logs, fraud prevention, abuse prevention, legal compliance, and
                internal recordkeeping.
              </Typography>
            </>
          ),
        },
        {
          id: "account-deletion",
          heading: "10. Account Deletion and Content Retention",
          content: (
            <>
              <Typography variant="body1">
                You may be able to delete your account or request deletion of your account information.
              </Typography>
              <Typography variant="body1">Please note:</Typography>
              <ul>
                <li><Typography variant="body1">some content may remain visible to others if it was previously shared in plans, chats, or similar collaborative areas</Typography></li>
                <li><Typography variant="body1">some records may be retained where reasonably necessary for legal compliance, security, fraud prevention, moderation, dispute resolution, or backup and archival purposes</Typography></li>
                <li><Typography variant="body1">deletion from active systems may not immediately remove data from backups</Typography></li>
              </ul>
            </>
          ),
        },
        {
          id: "security",
          heading: "11. Security",
          content: (
            <Typography variant="body1">
              We use reasonable administrative, technical, and organizational safeguards designed to protect
              personal information against unauthorized access, loss, misuse, or disclosure. However, no
              method of transmission or storage is completely secure, and we cannot guarantee absolute security.
            </Typography>
          ),
        },
        {
          id: "international-processing",
          heading: "12. International Processing",
          content: (
            <Typography variant="body1">
              NewChums and our service providers may process or store personal information outside your
              province or country of residence. As a result, personal information may be accessible to
              foreign courts, law enforcement, or regulatory authorities in accordance with applicable
              laws in those jurisdictions.
            </Typography>
          ),
        },
        {
          id: "your-choices",
          heading: "13. Your Choices and Rights",
          content: (
            <>
              <Typography variant="body1">
                Subject to applicable law, you may have the right to:
              </Typography>
              <ul>
                <li><Typography variant="body1">access personal information we hold about you</Typography></li>
                <li><Typography variant="body1">request correction of inaccurate information</Typography></li>
                <li><Typography variant="body1">request deletion of certain information</Typography></li>
                <li><Typography variant="body1">withdraw consent for certain optional uses</Typography></li>
                <li><Typography variant="body1">manage notification settings and optional communications</Typography></li>
              </ul>
              <Typography variant="body1">
                To make a request, contact us at{" "}
                <MuiLink href="mailto:contact@newchums.com" color="primary">
                  contact@newchums.com
                </MuiLink>.
              </Typography>
            </>
          ),
        },
        {
          id: "children",
          heading: "14. Children",
          content: (
            <Typography variant="body1">
              NewChums is not intended for children under 18, and we do not knowingly allow individuals
              under 18 to use the Service at launch.
            </Typography>
          ),
        },
        {
          id: "changes",
          heading: "15. Changes to This Privacy Policy",
          content: (
            <Typography variant="body1">
              We may update this Privacy Policy from time to time. If we make material changes, we may
              provide notice through the Service, by email, or by other appropriate means. Your continued
              use of NewChums after an update takes effect means you acknowledge the revised Privacy Policy.
            </Typography>
          ),
        },
        {
          id: "contact",
          heading: "16. Contact Us",
          content: (
            <>
              <Typography variant="body1">
                If you have questions, requests, or concerns about this Privacy Policy or our privacy
                practices, contact us at:
              </Typography>
              <Typography variant="body1">
                <strong>Email:</strong>{" "}
                <MuiLink href="mailto:contact@newchums.com" color="primary">
                  contact@newchums.com
                </MuiLink>
              </Typography>
              <Typography variant="body1">
                <strong>Mailing Address:</strong> [INSERT BUSINESS OR MAILING ADDRESS]
              </Typography>
            </>
          ),
        },
      ]}
    />
  );
}
