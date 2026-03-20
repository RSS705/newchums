"use client";

import Box from "@mui/material/Box";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * Internal documentation for super admins: product behavior by UI surface.
 * Keep in sync with actual product behavior (see Technical_Specs.md for low-level detail).
 */
export default function AdminSystemLogicClient() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        System Logic
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Plain-language notes on what actually happens in a few key screens. Handy when you&rsquo;re answering &ldquo;why did it do that?&rdquo; — add more
        sections here as you document other flows.
      </Typography>

      <CollapsibleSection title="Add plan" subtitle="Start a plan → Publish (creates a live plan in one step)">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          What Publish does
        </Typography>
        <Bullet>
          The plan is stored as <strong>published</strong> (not a draft). The person creating it is the host and is automatically counted as{" "}
          <strong>going</strong>, same as a normal RSVP.
        </Bullet>
        <Bullet>
          At least <strong>one hobby</strong> is required; the form won&rsquo;t submit without it.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Who can see this? (visibility)
        </Typography>
        <Bullet>
          This only controls <strong>who can discover and open</strong> the plan in the app (Explore, direct links, opening the plan page). It is{" "}
          <strong>not</strong> wired to &ldquo;email everyone in this audience.&rdquo;
        </Bullet>
        <Bullet>
          <strong>Public:</strong> Anyone signed in can discover it (e.g. Explore) subject to the usual filters; opening the plan follows normal rules.
        </Bullet>
        <Bullet>
          <strong>Chums only:</strong> On Explore (and similar lists), someone signed in sees the plan if <strong>they are the host</strong> or{" "}
          <strong>the host is on their Chum list</strong> (someone they&rsquo;ve saved). Strangers who don&rsquo;t have that relationship to the host
          won&rsquo;t see it there the way they would a public plan.
        </Bullet>
        <Bullet>
          <strong>Invite only:</strong> The plan stays hidden unless someone has access through an <strong>invite</strong> (or similar token flow). It is
          not shown like a public listing.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Emails at publish time
        </Typography>
        <Bullet>
          <strong>Invite emails</strong> only go out if the create request includes <strong>explicit invitees</strong> (account or email). The current Start
          a plan screen <strong>does not</strong> send invitees in that request, so <strong>no invite emails are sent</strong> from this flow today.
        </Bullet>
        <Bullet>
          Choosing <strong>Chums only</strong> does <strong>not</strong> email every person on the host&rsquo;s Chum list—there is no mass &ldquo;notify all
          Chums&rdquo; step tied to visibility.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Later: discovery digest (separate from Publish)
        </Typography>
        <Bullet>
          A <strong>public</strong>, <strong>in-person</strong> plan may later appear in the &ldquo;new plans matching my interests&rdquo; email for people who
          qualify—see <strong>Digest emails</strong> below (it&rsquo;s not instant when you hit Publish).
        </Bullet>
        <Bullet>
          A <strong>Chums only</strong> plan can appear in that same digest for people the host has on their <strong>Chum list</strong> who also{" "}
          <strong>share a hobby</strong> with the plan and meet the same <strong>location / radius</strong> rules as public plans (see{" "}
          <strong>Digest emails</strong> below). <strong>Invite only</strong> plans never appear in this digest.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Edit plan" subtitle="Host opens Edit on a published plan and saves">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Who can save
        </Typography>
        <Bullet>
          Only the <strong>host</strong>, and only while the plan is <strong>published</strong>. Canceled plans can&rsquo;t be edited through this dialog.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          What Save updates
        </Typography>
        <Bullet>
          One save applies everything in the form: title, date/time, description, hobbies, capacity, visibility, confirmation/approval/invite settings, and
          related options the dialog exposes.
        </Bullet>
        <Bullet>
          The system compares <strong>before vs after</strong> and builds a short list of what changed (for example title, date, visibility, capacity). That
          list is what attendees may see in their update email when applicable.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Who gets notified after Save
        </Typography>
        <Bullet>
          <strong>In-app:</strong> Everyone with RSVP <strong>Going</strong> or <strong>Maybe</strong> except the host gets a notification that the plan
          was updated (or locked/canceled on other actions—not covered in detail here).
        </Bullet>
        <Bullet>
          <strong>Email:</strong> Those same people can get a &ldquo;plan changed&rdquo; email <strong>only if</strong>{" "}
          <strong>Plan canceled or changed</strong> is still enabled in their notification settings (same toggle covers both kinds of heads-ups).
        </Bullet>
        <Bullet>
          People on <strong>Can&rsquo;t make it</strong> (or not on the plan) are <strong>not</strong> in this recipient list. The host does not get this
          email as an attendee—they already know they edited.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          What Save does <em>not</em> do
        </Typography>
        <Bullet>
          Changing <strong>visibility alone</strong> does <strong>not</strong> send a new round of <strong>invite</strong> emails. Inviting people is a
          separate action from the plan page.
        </Bullet>
        <Bullet>
          This is different from <strong>Someone invited you to a plan</strong>—that path is for invites, not for saving edits.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Digest emails" subtitle="Background emails that batch things up—not the same as instant invites or edit notices">
        <Bullet>
          These run on a <strong>schedule in the background</strong> (same kind of timer that handles other housekeeping). They&rsquo;re not sent the
          instant someone clicks Publish on a plan.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Unread chat digest
        </Typography>
        <Bullet>
          <strong>Who it&rsquo;s for:</strong> You&rsquo;re the host or you&rsquo;re marked <strong>going</strong> on a plan that isn&rsquo;t canceled.
        </Bullet>
        <Bullet>
          <strong>What triggers it:</strong> Someone else posted in that plan&rsquo;s chat <strong>after</strong> your last read (or first-time read), and
          that message is newer than the last time we sent you this digest.
        </Bullet>
        <Bullet>
          <strong>Extra gates:</strong> <strong>Unread messages in your plans</strong> is on in notification settings; it&rsquo;s been{" "}
          <strong>about 23+ hours</strong> since we last sent you this digest; and there&rsquo;s at least one plan with unread chat to mention. We list up
          to <strong>10 plans</strong> per email.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          New plans matching my interests (near you)
        </Typography>
        <Bullet>
          <strong>Who it&rsquo;s for:</strong> You have a <strong>home location</strong> saved (map pin), <strong>New plans matching my interests</strong> is
          on in notification settings, and you meet the rules for at least one of the two paths below.
        </Bullet>
        <Bullet>
          <strong>Path A — Public plans:</strong> You share at least one <strong>hobby</strong> with the plan. The plan is <strong>published</strong>,{" "}
          <strong>public</strong>, <strong>in person</strong>, still <strong>in the future</strong>, you&rsquo;re <strong>not the host</strong>, the venue has
          map coordinates, and the plan falls <strong>within your travel radius</strong> (default 200 km if unset). <strong>New</strong> since your last digest
          (or about the last day if you&rsquo;ve never gotten this email). If there&rsquo;s a seat cap, the plan still has <strong>room</strong>.
        </Bullet>
        <Bullet>
          <strong>Path B — Chums-only plans:</strong> Same hobby, distance, timing, capacity, and other rules as <strong>Path A</strong>, and the plan is{" "}
          <strong>Chums only</strong> instead of public. Additionally, the host must have <strong>you</strong> on <strong>their</strong> Chum list. Example:
          Robert creates a Chums-only plan about board games; Mike is on Robert&rsquo;s Chum list and has that hobby in range; Sarah is not on Robert&rsquo;s
          list—Mike can see it in the digest, Sarah won&rsquo;t (for this plan).
        </Bullet>
        <Bullet>
          <strong>Who does <em>not</em> get this:</strong> <strong>Invite only</strong> plans never appear. <strong>Online-only</strong> plans don&rsquo;t
          either. <strong>Chums-only</strong> plans don&rsquo;t appear for people who aren&rsquo;t on the host&rsquo;s Chum list, or who don&rsquo;t share a hobby
          with the plan, or who are outside the usual radius / other Path A rules.
        </Bullet>
        <Bullet>
          <strong>Cooldown:</strong> We won&rsquo;t send you another round of the <em>same</em> digest type until about <strong>a day</strong> after the
          last one (each type tracks separately).
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Public plan participation (share link)" subtitle="How visitors without an account can RSVP to public plans">
        <Bullet>
          <strong>Who it&rsquo;s for:</strong> Someone without a NewChums account visits a <strong>public</strong> plan via a share link.
        </Bullet>
        <Bullet>
          <strong>Flow:</strong> They enter their <strong>email</strong> (and optionally their name). We send a <strong>6-digit verification code</strong> to that
          email. After entering the code, they can <strong>RSVP</strong> (Going / Maybe / Can&rsquo;t make it).
        </Bullet>
        <Bullet>
          <strong>If the email already has an account:</strong> We prompt them to <strong>sign in</strong> instead of sending a code.
        </Bullet>
        <Bullet>
          <strong>Identity:</strong> The visitor gets a signed <strong>participation token</strong> (valid 30 days) stored in their browser. This token is tied to
          their verified email and the specific plan. It works the same way an invite token works for invited guests.
        </Bullet>
        <Bullet>
          <strong>Account linking:</strong> If they later create a NewChums account with the same email, their RSVP and any alternate-time suggestions are
          automatically linked to their new account the next time they view the plan.
        </Bullet>
        <Bullet>
          <strong>Cross-plan convenience:</strong> If they&rsquo;ve verified on one public plan, their email is pre-filled when they visit another public plan (a
          new code is still required).
        </Bullet>
        <Bullet>
          <strong>Not available for:</strong> Chums-only or Invite-only plans. Those require an account or an invite link.
        </Bullet>
      </CollapsibleSection>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", mt: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Want endpoints, database names, or the exact email templates? That lives in the repo docs (e.g. Technical_Specs) — this page is just the friendly
          version for humans.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: "block", mt: 1.5 }}>
          <strong>Maintainers:</strong> When product behavior changes (plans, emails, notifications, digests, etc.), review this tab in the{" "}
          <strong>same change set</strong> and update it so it stays accurate. Keep it to key logic, plain language, and short bullets — see{" "}
          <strong>AGENTS.md</strong> (System Logic).
        </Typography>
      </Paper>
    </Box>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Accordion
      defaultExpanded={false}
      disableGutters
      elevation={0}
      sx={{
        mb: 2,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        "&:before": { display: "none" },
        overflow: "hidden",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: 2,
          py: 1.25,
          "& .MuiAccordionSummary-content": { my: 1, overflow: "hidden" },
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.35, pr: 1 }}>
            {subtitle}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0 }}>
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={1.25}>{children}</Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" component="div" sx={{ lineHeight: 1.65, pl: 0.5 }}>
      <Box component="span" sx={{ color: "primary.main", mr: 1, fontWeight: 700 }}>
        &bull;
      </Box>
      {children}
    </Typography>
  );
}
