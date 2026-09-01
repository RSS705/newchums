"use client";

import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import LegalPageContent from "@/components/legal/LegalPageContent";

export default function TermsContent() {
  return (
    <LegalPageContent
      title="Terms of Use"
      effectiveDateLine="Effective Date: April 1, 2026"
      lastUpdatedLine="Last Updated: September 1, 2026"
      intro={
        <>
          These Terms of Use (&ldquo;Terms&rdquo;) govern your use of the NewChums website, apps,
          features, and related services (collectively, the &ldquo;Service&rdquo;).
          <br /><br />
          NewChums is operated by <strong>OurModule</strong>{" "}
          (&ldquo;NewChums,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          <br /><br />
          By accessing or using NewChums, you agree to these Terms. If you do not agree, do not use the Service.
        </>
      }
      sections={[
        {
          id: "eligibility",
          heading: "1. Eligibility",
          content: (
            <Typography variant="body1">
              You must be at least <strong>18 years old</strong> to use NewChums. By using the Service,
              you represent and warrant that you are at least 18 and legally able to enter into these Terms.
            </Typography>
          ),
        },
        {
          id: "nature-of-service",
          heading: "2. Nature of the Service",
          content: (
            <>
              <Typography variant="body1">
                NewChums is a platform that helps users create, discover, organize, join, and communicate
                about plans, events, and social gatherings. NewChums is not the organizer, sponsor, venue
                operator, transportation provider, insurer, or supervisor of user-created plans unless
                expressly stated otherwise.
              </Typography>
              <Typography variant="body1">
                Users are responsible for their own choices, conduct, attendance, communications, and participation.
              </Typography>
            </>
          ),
        },
        {
          id: "user-accounts",
          heading: "3. User Accounts",
          content: (
            <>
              <Typography variant="body1">
                You may need to create an account to use some or all features of the Service. You agree to:
              </Typography>
              <ul>
                <li><Typography variant="body1">provide accurate, current, and complete information</Typography></li>
                <li><Typography variant="body1">keep your login credentials secure</Typography></li>
                <li><Typography variant="body1">notify us promptly of suspected unauthorized access or misuse</Typography></li>
                <li><Typography variant="body1">remain responsible for activity under your account unless prohibited by law</Typography></li>
              </ul>
              <Typography variant="body1">
                We may suspend or restrict access if we believe your account is being used improperly or
                presents safety, legal, or operational risk.
              </Typography>
            </>
          ),
        },
        {
          id: "user-content",
          heading: "4. User Content",
          content: (
            <>
              <Typography variant="body1">
                You may submit content through the Service, including profile details, photos, plan
                descriptions, messages, comments, attendance responses, invitations, and other materials
                (&ldquo;User Content&rdquo;).
              </Typography>
              <Typography variant="body1">You agree that:</Typography>
              <ul>
                <li><Typography variant="body1">you are responsible for the User Content you submit</Typography></li>
                <li><Typography variant="body1">your User Content must not violate the law or the rights of others</Typography></li>
                <li><Typography variant="body1">your User Content must not be fraudulent, abusive, threatening, harassing, hateful, sexually exploitative, misleading, defamatory, infringing, or otherwise inappropriate</Typography></li>
              </ul>
              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>
                Ownership and Rights in User Content
              </Typography>
              <Typography variant="body1">
                You retain ownership of the User Content you submit to NewChums, subject to the rights
                you grant to us in these Terms.
              </Typography>
              <Typography variant="body1">
                By submitting, posting, uploading, sending, or otherwise making User Content available
                through the Service, you grant NewChums a worldwide, non-exclusive, royalty-free,
                transferable, sublicensable license to host, store, reproduce, modify, adapt, publish,
                display, distribute, communicate, analyze, and otherwise use that User Content as
                reasonably necessary to operate, provide, improve, promote, moderate, secure, and support
                the Service.
              </Typography>
              <Typography variant="body1">This includes the right to:</Typography>
              <ul>
                <li><Typography variant="body1">display User Content within plans, chats, profiles, and other areas of the Service</Typography></li>
                <li><Typography variant="body1">display certain User Content on public or semi-public plan pages where that functionality is part of the Service</Typography></li>
                <li><Typography variant="body1">use User Content for safety, moderation, fraud prevention, troubleshooting, customer support, analytics, and legal compliance</Typography></li>
                <li><Typography variant="body1">retain and use User Content as reasonably necessary in backups, logs, and archival systems for legitimate business, legal, and operational purposes</Typography></li>
              </ul>
              <Typography variant="body1">
                You represent and warrant that you have all rights necessary to submit the User Content
                and to grant the rights described in these Terms.
              </Typography>
              <Typography variant="body1">
                This license ends when your User Content is deleted from our active systems, except to the
                extent that:
              </Typography>
              <ul>
                <li><Typography variant="body1">the content has already been shared with other users</Typography></li>
                <li><Typography variant="body1">the content has been incorporated into plan, chat, moderation, safety, backup, archival, or legal records</Typography></li>
                <li><Typography variant="body1">retention is reasonably necessary for legal, security, fraud prevention, dispute resolution, or operational purposes</Typography></li>
              </ul>
            </>
          ),
        },
        {
          id: "acceptable-use",
          heading: "5. Acceptable Use",
          content: (
            <>
              <Typography variant="body1">You agree not to:</Typography>
              <ul>
                <li><Typography variant="body1">use NewChums for unlawful purposes</Typography></li>
                <li><Typography variant="body1">impersonate another person or misrepresent your identity</Typography></li>
                <li><Typography variant="body1">post false, misleading, or deceptive information about plans, attendance, or users</Typography></li>
                <li><Typography variant="body1">harass, threaten, stalk, exploit, or endanger other users</Typography></li>
                <li><Typography variant="body1">scrape, crawl, copy, or extract Service data except as permitted by law or by us in writing</Typography></li>
                <li><Typography variant="body1">interfere with the Service, its infrastructure, or other users&rsquo; access</Typography></li>
                <li><Typography variant="body1">attempt unauthorized access to accounts, systems, or data</Typography></li>
                <li><Typography variant="body1">use the Service to distribute spam, malware, or harmful code</Typography></li>
                <li><Typography variant="body1">use NewChums to facilitate illegal, violent, exploitative, or unsafe activity</Typography></li>
              </ul>
            </>
          ),
        },
        {
          id: "plans-events-rsvps",
          heading: "6. Plans, Events, RSVPs, and Attendance",
          content: (
            <>
              <Typography variant="body1">
                Users may create, host, join, leave, decline, or otherwise interact with plans through the Service.
              </Typography>
              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>Host Controls</Typography>
              <Typography variant="body1">Hosts may have the ability to:</Typography>
              <ul>
                <li><Typography variant="body1">create public, private, or mixed-access plans</Typography></li>
                <li><Typography variant="body1">invite or remove users</Typography></li>
                <li><Typography variant="body1">approve or decline join requests</Typography></li>
                <li><Typography variant="body1">edit or cancel plans</Typography></li>
                <li><Typography variant="body1">set attendance-related requirements, including attendance assurance or final confirmation features where available</Typography></li>
              </ul>
              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>Attendance Information</Typography>
              <Typography variant="body1">
                RSVPs, attendance confirmations, and related indicators are provided to help users organize
                plans more effectively. They are informational only and do not create a legally binding
                obligation for any user to attend, host, or proceed with a plan.
              </Typography>
              <Typography variant="body1">
                NewChums may provide reminders, final confirmation requests, viability indicators, host
                alerts, minimum confirmed attendance tools, auto-cancellation rules, or similar planning
                features. These tools are designed to assist users but do not guarantee attendance,
                turnout, punctuality, compatibility, safety, or plan success.
              </Typography>
              <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }}>Host and Attendee Conduct</Typography>
              <Typography variant="body1">
                Each user remains responsible for their own participation decisions, conduct, compliance
                with applicable law, and personal safety. NewChums does not guarantee the identity,
                behavior, intentions, or reliability of any user.
              </Typography>
            </>
          ),
        },
        {
          id: "safety",
          heading: "7. Safety and Real-World Interactions",
          content: (
            <>
              <Typography variant="body1">
                NewChums may be used to organize in-person gatherings, including gatherings involving
                people who do not already know one another. You understand that real-world interactions
                involve personal judgment and risk.
              </Typography>
              <Typography variant="body1">By using the Service, you acknowledge that:</Typography>
              <ul>
                <li><Typography variant="body1">you are responsible for your own decisions about whether, when, and how to attend or host a plan</Typography></li>
                <li><Typography variant="body1">NewChums does not conduct comprehensive background checks on users unless expressly stated</Typography></li>
                <li><Typography variant="body1">NewChums does not guarantee that users will behave appropriately, attend as expected, or comply with host expectations</Typography></li>
                <li><Typography variant="body1">you should use your own judgment and follow reasonable safety practices</Typography></li>
              </ul>
              <Typography variant="body1">
                We reserve the right, but not the obligation, to investigate complaints and take action
                regarding safety concerns, misconduct, suspected fraud, or violations of these Terms.
              </Typography>
            </>
          ),
        },
        {
          id: "moderation",
          heading: "8. Moderation and Enforcement",
          content: (
            <>
              <Typography variant="body1">
                We may review, remove, restrict, suspend, disable, or terminate access to accounts, plans,
                messages, or other content if we believe, in our sole discretion, that it is necessary to:
              </Typography>
              <ul>
                <li><Typography variant="body1">protect users or third parties</Typography></li>
                <li><Typography variant="body1">investigate or respond to safety concerns</Typography></li>
                <li><Typography variant="body1">prevent fraud, abuse, or platform manipulation</Typography></li>
                <li><Typography variant="body1">enforce these Terms or other platform policies</Typography></li>
                <li><Typography variant="body1">comply with law or legal process</Typography></li>
                <li><Typography variant="body1">protect the reputation, integrity, or operation of NewChums</Typography></li>
              </ul>
              <Typography variant="body1">
                We are not required to monitor all content or user activity, but we may do so.
              </Typography>
            </>
          ),
        },
        {
          id: "no-show-reliability",
          heading: "9. No-Show, Reliability, and Account Standing",
          content: (
            <Typography variant="body1">
              NewChums may use participation-related information, including RSVPs, attendance confirmations,
              cancellations, missed confirmations, host actions, reported no-shows, and similar signals to
              improve the Service and to inform future account standing, trust, access, ranking, moderation,
              or reliability-related features. We may take participation history into account when enforcing
              platform rules or making future product decisions.
            </Typography>
          ),
        },
        {
          id: "third-party",
          heading: "10. Third-Party Services and Links",
          content: (
            <Typography variant="body1">
              The Service may rely on or integrate with third-party services, including infrastructure,
              email, authentication, maps, analytics, and payment-related providers if implemented. We are
              not responsible for the content, policies, uptime, or practices of third-party services.
            </Typography>
          ),
        },
        {
          id: "intellectual-property",
          heading: "11. Intellectual Property",
          content: (
            <>
              <Typography variant="body1">
                Except for rights expressly granted to users, the Service, including its software, design,
                branding, text, graphics, interfaces, workflows, and other content, is owned by or licensed
                to NewChums and is protected by intellectual property and other applicable laws.
              </Typography>
              <Typography variant="body1">
                You may not copy, modify, distribute, reverse engineer, or exploit the Service except as
                permitted by law or with our written permission.
              </Typography>
            </>
          ),
        },
        {
          id: "service-availability",
          heading: "12. Service Availability and Changes",
          content: (
            <>
              <Typography variant="body1">
                We may change, suspend, or discontinue any part of the Service at any time, with or without
                notice, including features relating to RSVPs, attendance confirmations, invitations,
                notifications, or plan visibility.
              </Typography>
              <Typography variant="body1">
                We do not guarantee uninterrupted availability, error-free operation, or that the Service
                will always function as expected.
              </Typography>
            </>
          ),
        },
        {
          id: "disclaimers",
          heading: "13. Disclaimers",
          content: (
            <>
              <Typography variant="body1">
                The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis to the
                fullest extent permitted by law.
              </Typography>
              <Typography variant="body1">
                To the fullest extent permitted by law, NewChums disclaims all warranties, representations,
                and conditions, express, implied, statutory, or collateral, including implied warranties or
                conditions of merchantability, fitness for a particular purpose, title, non-infringement,
                availability, accuracy, quiet enjoyment, and that the Service will be uninterrupted, secure,
                or error-free.
              </Typography>
              <Typography variant="body1">NewChums does not warrant or guarantee:</Typography>
              <ul>
                <li><Typography variant="body1">that any user will attend, host, or complete a plan</Typography></li>
                <li><Typography variant="body1">that any plan will occur as expected</Typography></li>
                <li><Typography variant="body1">that any user is truthful, safe, compatible, or reliable</Typography></li>
                <li><Typography variant="body1">that attendance assurance, confirmations, reminders, or related features will prevent cancellations, no-shows, or disputes</Typography></li>
              </ul>
            </>
          ),
        },
        {
          id: "limitation-of-liability",
          heading: "14. Limitation of Liability",
          content: (
            <>
              <Typography variant="body1">
                To the fullest extent permitted by law, NewChums and its owners, operators, officers,
                employees, contractors, affiliates, licensors, and service providers will not be liable for
                any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any
                loss of profits, revenues, business, goodwill, data, or opportunity, arising out of or
                related to your use of or inability to use the Service.
              </Typography>
              <Typography variant="body1">
                To the fullest extent permitted by law, our total aggregate liability for any claim arising
                out of or relating to the Service or these Terms will not exceed the greater of:
              </Typography>
              <ul>
                <li><Typography variant="body1">the amount you paid us, if any, in the 12 months before the claim arose, or</Typography></li>
                <li><Typography variant="body1">CAD $100</Typography></li>
              </ul>
              <Typography variant="body1">
                Nothing in these Terms excludes liability that cannot be excluded under applicable law.
              </Typography>
            </>
          ),
        },
        {
          id: "indemnity",
          heading: "15. Indemnity",
          content: (
            <Typography variant="body1">
              You agree to defend, indemnify, and hold harmless NewChums and its owners, operators,
              affiliates, officers, employees, contractors, service providers, and agents from and against
              any claims, liabilities, damages, judgments, losses, costs, and expenses, including reasonable
              legal fees, arising out of or related to: your use of the Service; your User Content; your
              plans, events, attendance, hosting, invitations, or communications; your violation of these
              Terms; or your violation of law or the rights of any third party.
            </Typography>
          ),
        },
        {
          id: "termination",
          heading: "16. Termination",
          content: (
            <>
              <Typography variant="body1">
                You may stop using the Service at any time.
              </Typography>
              <Typography variant="body1">
                We may suspend, restrict, or terminate your access to all or part of the Service at any
                time, with or without notice, if we believe you have violated these Terms, created risk for
                users or the platform, or if termination is otherwise reasonably necessary.
              </Typography>
              <Typography variant="body1">
                Sections that by their nature should survive termination will survive, including sections
                relating to User Content, intellectual property, disclaimers, limitation of liability,
                indemnity, disputes, and enforcement.
              </Typography>
            </>
          ),
        },
        {
          id: "governing-law",
          heading: "17. Governing Law",
          content: (
            <>
              <Typography variant="body1">
                These Terms are governed by the laws of the Province of Ontario and the laws of Canada
                applicable therein, without regard to conflict of law principles.
              </Typography>
              <Typography variant="body1">
                You agree that any dispute arising out of or relating to these Terms or the Service will be
                brought exclusively in the courts located in Ontario, Canada, unless applicable law requires
                otherwise.
              </Typography>
            </>
          ),
        },
        {
          id: "changes",
          heading: "18. Changes to These Terms",
          content: (
            <Typography variant="body1">
              We may update these Terms from time to time. If we make material changes, we may provide notice
              through the Service, by email, or by other reasonable means. By continuing to use the Service
              after updated Terms take effect, you agree to the revised Terms.
            </Typography>
          ),
        },
        {
          id: "contact",
          heading: "19. Contact",
          content: (
            <>
              <Typography variant="body1">Questions about these Terms may be sent to:</Typography>
              <Typography variant="body1">
                <strong>Email:</strong>{" "}
                <MuiLink href="mailto:contact@newchums.com" color="primary">
                  contact@newchums.com
                </MuiLink>
              </Typography>
              <Typography variant="body1">
                <strong>Mailing Address:</strong>
                <br />
                OurModule
                <br />
                107-1025 King St E, #3175
                <br />
                Cambridge, ON N3H 3P5
              </Typography>
            </>
          ),
        },
      ]}
    />
  );
}
