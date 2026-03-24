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
          This controls <strong>discoverability</strong> (Explore feed, digests), <strong>not</strong> direct URL access.
          Anyone with a direct link can view a published plan (public preview for non-logged-in visitors, full detail for logged-in users).
          It is <strong>not</strong> wired to &ldquo;email everyone in this audience.&rdquo;
        </Bullet>
        <Bullet>
          <strong>Public:</strong> Anyone signed in can discover it (e.g. Explore) subject to the usual filters. Non-logged-in visitors with the direct link see a limited preview.
        </Bullet>
        <Bullet>
          <strong>Chums only:</strong> On Explore (and similar lists), someone signed in sees the plan if <strong>they are the host</strong> or{" "}
          <strong>they are in the host&rsquo;s On NewChums connections</strong>. Strangers who don&rsquo;t have that relationship to the host
          won&rsquo;t see it there the way they would a public plan.
        </Bullet>
        <Bullet>
          <strong>Invite only:</strong> The plan stays hidden from Explore and digests. Access is through an <strong>invite</strong> (or similar token flow).
          A direct link still works but non-logged-in visitors see only a limited preview.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Emails at publish time
        </Typography>
        <Bullet>
          <strong>Invite emails</strong> only go out if the create request includes <strong>explicit invitees</strong> (account or email). The current Start
          a plan screen <strong>does not</strong> send invitees in that request, so <strong>no invite emails are sent</strong> from this flow today.
        </Bullet>
        <Bullet>
          Choosing <strong>Chums only</strong> does <strong>not</strong> email every person in the host&rsquo;s connections—there is no mass notify step tied to visibility.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Later: discovery digest (separate from Publish)
        </Typography>
        <Bullet>
          A <strong>public</strong>, <strong>in-person</strong> plan may later appear in the &ldquo;new plans matching my interests&rdquo; email for people who
          qualify—see <strong>Digest emails</strong> below (it&rsquo;s not instant when you hit Publish).
        </Bullet>
        <Bullet>
          A <strong>Chums only</strong> plan can appear in that same digest for people in the host&rsquo;s <strong>On NewChums</strong> connections who also{" "}
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
          <strong>Chums only</strong> instead of public. Additionally, the host must have <strong>you</strong> in their <strong>On NewChums</strong> connections. Example:
          Robert creates a Chums-only plan about board games; Mike is in Robert&rsquo;s On NewChums connections and has that hobby in range; Sarah is not—Mike can see it in the digest, Sarah won&rsquo;t (for this plan).
        </Bullet>
        <Bullet>
          <strong>Who does <em>not</em> get this:</strong> <strong>Invite only</strong> plans never appear. <strong>Online-only</strong> plans don&rsquo;t
          either. <strong>Chums-only</strong> plans don&rsquo;t appear for people who aren&rsquo;t in the host&rsquo;s On NewChums connections, or who don&rsquo;t share a hobby
          with the plan, or who are outside the usual radius / other Path A rules.
        </Bullet>
        <Bullet>
          <strong>Cooldown:</strong> We won&rsquo;t send you another round of the <em>same</em> digest type until about <strong>a day</strong> after the
          last one (each type tracks separately).
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Plan sharing and guest participation" subtitle="How share links and public access work">
        <Bullet>
          <strong>Plain URL vs share link:</strong> A <strong>plain URL</strong> (<code>/events/[id]</code>) shows a <strong>public preview</strong> only &mdash;
          basic plan info, approximate location, attendee counts, and a sign-in prompt. No RSVP flow is available.
          The <strong>Copy Link</strong> button produces a <strong>share link</strong> (<code>/events/[id]?share_token=xxx</code>) that grants guest access.
        </Bullet>
        <Bullet>
          <strong>Who it&rsquo;s for:</strong> Someone without a NewChums account who receives a plan&rsquo;s <strong>share link</strong> (from Copy Link) or
          an <strong>invite email</strong>.
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
          <strong>Cross-plan convenience:</strong> If they&rsquo;ve verified on one plan, their email is pre-filled when they visit another plan via share link (a
          new code is still required).
        </Bullet>
        <Bullet>
          <strong>Share links work for any plan:</strong> Share links carry a signed token, so they work for <strong>public</strong>, <strong>chums-only</strong>,
          and <strong>invite-only</strong> plans alike. Without a share or invite token, non-public plans show only the public preview.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Connections and contacts" subtitle="How On NewChums and Private Contacts work">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          On NewChums
        </Typography>
        <Bullet>
          People who have <strong>NewChums accounts</strong>. Visible as part of your connections on your <strong>public profile</strong> (unless hidden in Settings).
        </Bullet>
        <Bullet>
          Used for <strong>Chums-only plan visibility</strong> and <strong>digest emails</strong>. If a host creates a Chums-only plan, only people in their On NewChums connections who also meet the hobby/distance rules will see it.
        </Bullet>
        <Bullet>
          <strong>One-way:</strong> Adding someone does <strong>not</strong> notify them or add you to their list. There is no mutual indicator.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Private Contacts
        </Typography>
        <Bullet>
          People without NewChums accounts (or people you track privately for planning). <strong>Only visible to you.</strong>
        </Bullet>
        <Bullet>
          Useful for <strong>planning and invites</strong>. Never shown on your public profile or anyone else&rsquo;s.
        </Bullet>
        <Bullet>
          You can add a private contact by <strong>email and/or name</strong>, with an optional <strong>private note</strong>.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Auto-linking
        </Typography>
        <Bullet>
          When a Private Contact later creates a NewChums account with the <strong>matching email</strong>, they automatically move to your <strong>On NewChums</strong> section. Notes are preserved.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Adding and searching
        </Typography>
        <Bullet>
          <strong>Search</strong> finds existing users (add to On NewChums) or, for emails not found, offers <strong>Add as Private Contact</strong> and/or <strong>Invite to NewChums</strong>.
        </Bullet>
        <Bullet>
          No notification is sent when you add someone to On NewChums.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Inviting
        </Typography>
        <Bullet>
          Sends an email invite. When the person signs up through the invite link, <strong>both users</strong> get each other as independent <strong>On NewChums</strong> connections.
        </Bullet>
        <Bullet>
          Sending an invite also creates a <strong>Private Contact</strong> entry for the invitee (if one doesn&rsquo;t exist), which auto-links when they join.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          What changed from the old model
        </Typography>
        <Bullet>
          The old &ldquo;mutual Chums&rdquo; behavior has been <strong>removed</strong>. Adding someone is one-way, private, and does not imply reciprocity or friendship.
        </Bullet>
        <Bullet>
          Private Contacts are a new concept for tracking off-platform people you plan with.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Post-plan feedback" subtitle="How attendees leave feedback after a plan ends">
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          When does it appear?
        </Typography>
        <Bullet>
          After a plan&rsquo;s start time has passed, a <strong>&ldquo;How did it go?&rdquo;</strong> section appears on the plan detail page for participants (host + going RSVPs).
        </Bullet>
        <Bullet>
          A <strong>reminder email</strong> is sent ~3 hours after the plan start time (via the hourly cron). One email per plan, tracked by <code>feedback_email_sent_at</code>.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          What do users rate?
        </Typography>
        <Bullet>
          For each attendee (excluding yourself): <strong>Reliability</strong>, <strong>Sociability</strong>, <strong>Presentation</strong>, <strong>Match Quality</strong> — each on a 3-point scale (Agree / Maybe / Disagree).
        </Bullet>
        <Bullet>
          If the attendee is the host, an extra prompt: <strong>Hosting Skills</strong> (&ldquo;I&rsquo;d join their plans again&rdquo;).
        </Bullet>
        <Bullet>
          All prompts are <strong>optional</strong>. Users can answer as many or as few as they like.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Separate from normal feedback
        </Typography>
        <Bullet>
          <strong>Attendance issues</strong> (no-show, cancelled too late, arrived very late) — reported separately via a dialog. This affects the <strong>reliability</strong> metric more directly.
        </Bullet>
        <Bullet>
          <strong>Conduct / safety concerns</strong> (harassment, aggressive behavior, boundary issues, etc.) — reported separately via a dedicated dialog. These are confidential and treated distinctly from normal scoring. Submissions trigger an <strong>immediate email alert</strong> to the admin team and appear in the <strong>Safety</strong> admin tab for review.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Privacy
        </Typography>
        <Bullet>
          All feedback is <strong>private</strong>. Users never see individual ratings others have given them.
        </Bullet>
        <Bullet>
          Hidden metrics (stored in <code>user_metrics</code>) aggregate feedback over time. These are <strong>not</strong> visible to users yet.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Chum preferences and matching quality" subtitle="How NewChums evaluates people for plan matching and recommendations">
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          What are chum preferences?
        </Typography>
        <Bullet>
          Each user can set <strong>matching preferences</strong> in their profile. These control who gets matched into their plans and who appears in their recommendations.
        </Bullet>
        <Bullet>
          Preferences are <strong>not visible</strong> to other users. They affect inbound matching only (who gets matched <em>to your plans</em>), not whether you can browse plans yourself.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          The four metrics
        </Typography>
        <Bullet>
          <strong>Reliability</strong> &mdash; Can this person be counted on to follow through? Moves quickly: no-shows and very late cancellations penalize immediately. Positive follow-through recovers more slowly.
        </Bullet>
        <Bullet>
          <strong>Sociability</strong> &mdash; Is this person enjoyable and easy to spend time with? Moves gradually; more subjective, relies on repeated signals.
        </Bullet>
        <Bullet>
          <strong>Personal Care (Presentation)</strong> &mdash; Does this person show basic in-person consideration? Moves cautiously but firmly; repeated negative signals matter.
        </Bullet>
        <Bullet>
          <strong>Hosting Skills</strong> &mdash; Does this person run well-organized plans? Only moves from feedback on plans they <em>hosted</em>.
        </Bullet>
        <Bullet>
          <strong>Conduct / Safety</strong> is tracked <em>separately</em> from these metrics. Serious behavioral issues do not lower normal metric scores &mdash; they may require moderation, warnings, or account action. Each concern report is emailed to the admin team immediately on submission and appears in the Safety admin tab with status tracking (new &rarr; reviewed &rarr; closed).
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Hidden scoring model
        </Typography>
        <Bullet>
          Every metric starts at a <strong>baseline of 50.00</strong> with 0 signals. This is a neutral, unrated state.
        </Bullet>
        <Bullet>
          Feedback nudges the score toward a target using <strong>weighted averaging</strong>: &ldquo;Yes&rdquo; targets 80, &ldquo;Somewhat&rdquo; targets 50, &ldquo;No&rdquo; targets 20. Early signals have a larger effect; later signals converge. Formula: nudge = (target &minus; current) &divide; (signal_count + 5).
        </Bullet>
        <Bullet>
          <strong>Attendance issues</strong> apply direct penalties to Reliability (raw values): No-show = &minus;10, Very late = &minus;8, Late cancel = &minus;5. The effective penalty is <strong>raw &times; confidence</strong> (see trust model below).
        </Bullet>
        <Bullet>
          Scores are <strong>never exposed</strong> to normal users. Super admins can inspect them via the User Diagnostics view.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Attendance trust and confidence model
        </Typography>
        <Bullet>
          Attendance issue reports carry a <strong>confidence level</strong> (0.00&ndash;1.00) that multiplies the raw penalty. This reduces the impact of potentially false or unverified reports.
        </Bullet>
        <Bullet>
          <strong>Host reports:</strong> confidence = 1.0 (full trust). The host has the strongest knowledge of who attended.
        </Bullet>
        <Bullet>
          <strong>Non-host uncorroborated:</strong> confidence = 0.75. A single attendee&rsquo;s report is meaningful but not definitive. A single false report at 0.75 causes limited damage (e.g. no-show: &minus;7.5, still above Preferred threshold).
        </Bullet>
        <Bullet>
          <strong>Corroborated:</strong> When 2+ independent reporters agree (same plan, person, and issue type), all reports are boosted to confidence 1.0. Prior lower-confidence reports are retroactively adjusted.
        </Bullet>
        <Bullet>
          <strong>Disputed by user:</strong> confidence drops to 0.5. The user can privately dispute active attendance issues on a plan. The reporter is <em>not</em> notified. A disputed no-show only applies &minus;5 instead of &minus;10.
        </Bullet>
        <Bullet>
          <strong>Dismissed by admin:</strong> confidence = 0. The penalty is fully reversed. Use when a report is clearly false or malicious.
        </Bullet>
        <Bullet>
          <strong>Confirmed by admin:</strong> confidence = 1.0. Full penalty applied. Use when admin verifies the report is accurate.
        </Bullet>
        <Bullet>
          <strong>Product rule:</strong> 2 no-shows from baseline (50 &minus; 20 = 30) or 1 no-show + 1 very late (50 &minus; 18 = 32) will drop a user below the <strong>Preferred</strong> threshold (&ge; 35), assuming no offsetting positive reliability feedback.
        </Bullet>
        <Bullet>
          Users can <strong>dispute</strong> attendance concerns from the plan feedback view. Disputes are private and do not reveal reporter identity. Super admins can <strong>dismiss</strong> or <strong>confirm</strong> issues from the User Diagnostics view.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Tolerance levels (what each setting means)
        </Typography>
        <Bullet>
          <strong>Open to anyone:</strong> No filtering on that metric. Everyone passes.
        </Bullet>
        <Bullet>
          <strong>Preferred:</strong> Score must be &ge; 35. Tolerates a mild negative average. Meaningfully filters consistently poor signals, but is forgiving.
        </Bullet>
        <Bullet>
          <strong>Important:</strong> Score must be &ge; 45. Only tolerates a small negative average. Filters out moderately poor signals.
        </Bullet>
        <Bullet>
          <strong>Required:</strong> Score must be &ge; 55. Firm minimum standard. Requires a near-baseline or positive record. Users with even a moderate negative average are filtered.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Browsing vs. inbound matching
        </Typography>
        <Bullet>
          My preferences filter who gets matched <strong>into my plans</strong> and who appears in my <strong>digest / recommendations</strong>.
        </Bullet>
        <Bullet>
          My preferences do <strong>not</strong> block me from browsing and opening plans myself. If someone in a plan doesn&rsquo;t meet my preferences, the plan details will surface a <strong>compatibility note</strong> so I can decide for myself.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Where chum preferences are enforced
        </Typography>
        <Bullet>
          <strong>Event match digest:</strong> Two-directional hard filter. Plans are excluded if the host fails the recipient&rsquo;s thresholds <em>or</em> the recipient fails the host&rsquo;s thresholds. Both must pass for a plan to appear in someone&rsquo;s digest.
        </Bullet>
        <Bullet>
          <strong>Explore feed:</strong> The host&rsquo;s preferences are enforced as a <strong>hard filter</strong> in the query &mdash; if the host doesn&rsquo;t want the viewer matched to their plan, it won&rsquo;t appear. The viewer&rsquo;s own preferences produce a <strong>soft compatibility note</strong> on the plan card and details page, but plans are not hidden.
        </Bullet>
        <Bullet>
          <strong>Plan details:</strong> When viewing a plan you didn&rsquo;t create, a compatibility note appears if the host doesn&rsquo;t fully meet your preferences. This is informational &mdash; it never blocks access to the plan.
        </Bullet>
        <Bullet>
          <strong>Disabled preferences:</strong> If a user has chum preferences turned off (or never configured), all checks pass. No filtering or notes are applied.
        </Bullet>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
          Plan-level preference overrides
        </Typography>
        <Bullet>
          When creating or editing a plan, the host can <strong>override their profile chum preferences</strong> for that specific plan only.
        </Bullet>
        <Bullet>
          <strong>Disable all:</strong> Turns off all chum preference filtering for that plan. Anyone can be matched regardless of the host&rsquo;s profile preferences.
        </Bullet>
        <Bullet>
          <strong>Disable specific metrics:</strong> The host can disable individual metrics (e.g. skip Sociability filtering). The remaining metrics still apply using the host&rsquo;s profile defaults.
        </Bullet>
        <Bullet>
          Overrides affect <strong>outbound matching only</strong> (who sees the plan in digest and explore). Viewer-side compatibility notes are <strong>not</strong> suppressed &mdash; viewers still see informational warnings based on their own preferences.
        </Bullet>
        <Bullet>
          Plans with no overrides behave exactly as before &mdash; the host&rsquo;s profile preferences apply in full.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection
        title="Objectives &amp; next-best-step nudges"
        subtitle="How NewChums guides users through onboarding and early retention."
      >
        <Typography variant="body2" fontWeight={600}>
          How it works
        </Typography>
        <Bullet>
          NewChums uses a <strong>next-best-step objective system</strong> to guide new users through onboarding and early product engagement.
        </Bullet>
        <Bullet>
          A single nudge appears above the page content on every logged-in view, showing the user their most relevant next action.
        </Bullet>
        <Bullet>
          The system is <strong>sequence-aware</strong>: objectives have a defined order and the nudge advances automatically as the user completes earlier steps.
        </Bullet>
        <Bullet>
          Objectives are evaluated in real time based on actual product data (profile fields, RSVPs, contacts, chat messages, feedback).
        </Bullet>

        <Bullet>
          The nudge does <strong>not</strong> appear on super admin pages.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
          Current objective sequence
        </Typography>
        <Bullet>Add your name &rarr; Add hobbies &rarr; Set location &rarr; Set travel distance &rarr; Write a bio &rarr; Add a profile picture &rarr; Join a plan &rarr; Attend a plan &rarr; Say hello in chat &rarr; Give feedback &rarr; Create a plan &rarr; Add a chum</Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
          User control
        </Typography>
        <Bullet>
          Users can <strong>dismiss</strong> the nudge for the current session (X button) or <strong>permanently turn off</strong> tutorial tips (&ldquo;Turn off tips&rdquo; link on the nudge).
        </Bullet>
        <Bullet>
          Users can <strong>re-enable</strong> tutorial tips from <strong>Settings &rarr; Tips &amp; guidance</strong>.
        </Bullet>
        <Bullet>
          The permanent opt-out is stored on the user record (<code style={{ fontSize: "0.85em" }}>tutorial_nudges_off</code>) and is respected globally.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
          Admin visibility
        </Typography>
        <Bullet>
          <strong>User Diagnostics:</strong> Shows completed/incomplete objectives, tutorial on/off state, and current next step for any user.
        </Bullet>
        <Bullet>
          <strong>KPI tab:</strong> Shows engagement rate (% of users who completed &ge;1 objective), average completion depth, opt-out count, and a per-objective completion funnel for drop-off analysis.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
          Architecture note
        </Typography>
        <Bullet>
          Completions are recorded durably in <code style={{ fontSize: "0.85em" }}>user_objective_completions</code> for analytics, but the source of truth for each objective is always the live product data (e.g., &ldquo;has hobbies&rdquo; = rows exist in <code style={{ fontSize: "0.85em" }}>user_interests</code>).
        </Bullet>
        <Bullet>
          The objective catalog is defined in code (<code style={{ fontSize: "0.85em" }}>api/src/objectives.ts</code>) and can be extended with new objectives without schema changes.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Communities" subtitle="Dedicated pages where users can join, share plans, and organize around a shared group">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          What is a community?
        </Typography>
        <Bullet>
          A community is a <strong>group page</strong> on NewChums. Members can browse and create plans within the community. Think of it as a shared space for
          a recurring group &mdash; a running club, a neighborhood board game crew, a book club.
        </Bullet>
        <Bullet>
          Every community has a <strong>unique handle</strong> (slug), a name, optional description, and optional location.
        </Bullet>
        <Bullet>
          The person who creates it is the <strong>owner</strong>. Super admins can also manage any community.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Visibility
        </Typography>
        <Bullet>
          <strong>Public:</strong> Anyone can find the community, see its members and plans, and join (or request to join).
        </Bullet>
        <Bullet>
          <strong>Private:</strong> Only members (and super admins) can see the member list and community plans. Non-members who visit the page see limited
          info &mdash; name, visibility, join mode, and member count &mdash; plus the option to request to join. Private communities have a <strong>share link</strong> the
          owner can send to people, which lets them view the community and request to join.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Joining
        </Typography>
        <Bullet>
          <strong>Open:</strong> Anyone can join instantly. No approval needed.
        </Bullet>
        <Bullet>
          <strong>Approval required:</strong> The user submits a join request. The owner sees pending requests and can approve or decline them. The requester
          gets an email when their request is approved or declined (once Postmark templates are configured).
        </Bullet>
        <Bullet>
          The owner also gets an email when someone requests to join (once the template is configured).
        </Bullet>
        <Bullet>
          The owner <strong>cannot leave</strong> their own community &mdash; they must transfer ownership first (not yet implemented as a UI action).
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Plans and communities
        </Typography>
        <Bullet>
          A plan can belong to <strong>zero or one</strong> community. When creating or editing a plan, you can associate it with a community you&rsquo;re a
          member of.
        </Bullet>
        <Bullet>
          Community plans appear in the <strong>community&rsquo;s plan feed</strong> on the community page.
        </Bullet>
        <Bullet>
          Community plans can optionally be <strong>hidden from Explore</strong> (<code style={{ fontSize: "0.85em" }}>hide_from_explore</code>). When hidden,
          they still show up in the community&rsquo;s own plan feed but are excluded from the general Explore page and digests.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Roles
        </Typography>
        <Bullet>
          <strong>Owner:</strong> Full control &mdash; edit community settings, approve/decline join requests, remove members, delete the community.
        </Bullet>
        <Bullet>
          <strong>Member:</strong> Can view the community, see other members, browse and create plans within it, and leave.
        </Bullet>
        <Bullet>
          <strong>Super admin:</strong> Can do everything an owner can across all communities, plus list and remove communities from the admin panel.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Community chat
        </Typography>
        <Bullet>
          <strong>Deferred.</strong> The schema has a <code style={{ fontSize: "0.85em" }}>chat_enabled</code> column but there is no community-level chat
          implementation yet. Plan-level chat (per-plan group chat) still works normally for plans within a community.
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
