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
 * Internal operator reference: what the product actually does on the user-visible flows.
 * Used for pilot support, testing, and answering "why did the app do that?"
 * Not a spec. For endpoints, schemas, template IDs see docs/Technical_Specs.md, AGENTS.md, System_Map.md.
 */
export default function AdminSystemLogicClient() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        System Logic
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Plain-language notes on what actually happens on the important user-visible flows. Use it when answering &ldquo;why did the app do
        that?&rdquo; during pilot testing and support. For deeper technical detail see <strong>docs/Technical_Specs.md</strong>,{" "}
        <strong>AGENTS.md</strong>, and <strong>docs/System_Map.md</strong>.
      </Typography>

      <CollapsibleSection title="Plan visibility and access" subtitle="Public, Chums only, Invite only, community-linked plans, direct URL access">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          The three visibility settings
        </Typography>
        <Bullet>
          <strong>Public:</strong> discoverable in Explore and digests to anyone signed in (subject to hobby / location / chum-preference
          filters). Logged-out visitors with the direct link see a limited preview.
        </Bullet>
        <Bullet>
          <strong>Chums only:</strong> shown on discovery surfaces only to the host and people in the host&rsquo;s <strong>On NewChums</strong>
          {" "}connections. Strangers don&rsquo;t see it in Explore, even if they&rsquo;re in the same community.
        </Bullet>
        <Bullet>
          <strong>Invite only:</strong> hidden from Explore, digests, and every discovery surface. Access is via invite or share token.
          The server forces invite-only plans to have <strong>no community link</strong> and <strong>no members-only gate</strong>.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Public previews (logged-out or no token)
        </Typography>
        <Bullet>
          Public pages show title, approximate location, attendee counts, and an anonymized &ldquo;Who&rsquo;s in&rdquo; row.
          They <strong>never</strong> reveal exact address, online join link, attendee names, or attendee handles.
        </Bullet>
        <Bullet>
          The same privacy-safe rule applies to <strong>plan cards on the logged-out community detail page</strong>. <code>GET /communities/:id/events</code>
          computes <code>locationDisplay</code> server-side (approximate area or &ldquo;Online&rdquo;) and returns <code>null</code> for{" "}
          <code>locationName</code>, <code>locationAddress</code>, <code>locationLat</code>, <code>locationLng</code>, and <code>onlineLink</code> when the
          caller is unauthenticated. Authenticated viewers still receive the full location set.
        </Bullet>
        <Bullet>
          Plan cards across the system (Explore, Your Plans, community detail, public landing, &ldquo;Recently happened&rdquo;) <strong>do not show
          a connected-community line</strong>. Community context is rendered on the plan <em>detail</em> page header instead.
        </Bullet>
        <Bullet>
          Share links (<code>?share_token=&hellip;</code>) grant preview access to non-public plans so the recipient can see the full page, but still
          need auth to RSVP or join chat.
        </Bullet>
        <Bullet>
          Non-public plans without a token return a locked view with a sign-in prompt, not a 404.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Community-linked plans
        </Typography>
        <Bullet>
          A plan can belong to <strong>zero or one</strong> community. Linking is organizational context only; it never widens who can see the plan
          beyond what its base visibility allows.
        </Bullet>
        <Bullet>
          <strong>Only show this plan to community members</strong> (on create/edit) narrows Explore only. It does not broaden anything and does not
          touch the community&rsquo;s own plan feed.
        </Bullet>
        <Bullet>
          Invite-only plans cannot be community-linked. The form hides the Community section for invite-only and the API enforces it server-side.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Recently happened (social proof)
        </Typography>
        <Bullet>
          The logged-out homepage and the logged-in Explore page both show a small{" "}
          <strong>Recently happened</strong> section below the main upcoming feed. It surfaces public-only plans
          from the last 30 days that show evidence of actually having run (at least one non-host RSVP marked Going).
          QA plans, canceled plans, chums-only and invite-only plans, and plans with the
          &ldquo;Only show this plan to community members&rdquo; toggle on are all excluded.
        </Bullet>
        <Bullet>
          Community detail pages also show a <strong>Recently happened</strong> block under their upcoming list,
          drawn from the last 90 days. It applies the same visibility rules as the upcoming community feed
          (public always; chums-only only to host / chums / RSVP&rsquo;d; invite-only never), so a private community&rsquo;s
          past plans never reach non-members.
        </Bullet>
        <Bullet>
          Past plan cards are visually distinct (gray banner, &ldquo;Happened today / yesterday / Apr 28&rdquo; date label,
          no RSVP button) and link to the plan detail page so a viewer can read what happened, never RSVP retroactively.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Add vs Edit
        </Typography>
        <Bullet>
          Create and Edit use the same form and the same rules. One save applies everything. Publish creates a live plan (no draft state); the host
          is auto-RSVP&rsquo;d as Going.
        </Bullet>
        <Bullet>
          Saving an edit may send a change email to Going/Maybe attendees if <em>Plan canceled or changed</em> is on in their notification settings.
          Editing does not re-send invite emails.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Invites, share links, and lightweight signup" subtitle="How visitors reach a plan and become accounts">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Getting to a plan
        </Typography>
        <Bullet>
          <strong>Plain URL</strong> (<code>/events/[id]</code>): public preview only for non-public plans.
        </Bullet>
        <Bullet>
          <strong>Share link</strong> (<code>?share_token=&hellip;</code>): full plan page for the recipient. Still needs auth to RSVP.
        </Bullet>
        <Bullet>
          <strong>Invite email</strong> (<code>?invite_token=&hellip;</code>): full plan page and, once signed in, the invite adopts the user&rsquo;s
          account and they appear as invited.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Lightweight signup (share and invite links, logged-out)
        </Typography>
        <Bullet>
          A small card asks for <strong>email</strong>, <strong>date of birth</strong> (18+), and legal acceptance. No name and no password.
        </Bullet>
        <Bullet>
          Submitting sends a one-click magic link (15-minute TTL). Clicking it creates the account with an auto-generated friendly username
          (e.g. <em>HappyOtter273</em>, editable later) and returns the user to the same plan, signed in.
        </Bullet>
        <Bullet>
          If the email already has a verified account, the form does <strong>not</strong> create a duplicate. It redirects to
          <code> /login?next=&lt;plan url&gt;</code> so they sign in and land back on the plan. Any DOB / legal entered is discarded.
        </Bullet>
        <Bullet>
          <strong>Password setup pending:</strong> accounts created this way have no password yet. A non-blocking banner in the app prompts them to set
          one from Settings so they can sign in later without needing an email link.
        </Bullet>
        <Bullet>
          <strong>Returning without a password:</strong> at <code>/login</code>, entering the email (no password on file) surfaces an
          <strong> Email me a sign-in link</strong> option.
        </Bullet>
        <Bullet>
          <strong>Self-invite prevention:</strong> a user cannot invite their own email.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="RSVPs, join requests, and attendee invites" subtitle="How people end up on (or off) a plan">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          RSVP
        </Typography>
        <Bullet>
          Statuses: <strong>Going</strong>, <strong>Maybe</strong>, <strong>Can&rsquo;t make it</strong>. Capacity is checked when someone sets
          Going; the plan blocks new Going RSVPs when full.
        </Bullet>
        <Bullet>
          <strong>Locked plans:</strong> hosts can lock a plan to freeze the Going list. Existing attendees can still change their status; new
          attendees are blocked.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Attendee invites
        </Typography>
        <Bullet>
          Hosts can toggle <strong>Let Going attendees invite others</strong> per plan. When on, Going attendees see an invite form on the plan page.
          Duplicate invites (by user or by email) are collapsed silently.
        </Bullet>
        <Bullet>
          Invites can include an optional personal note (up to 500 chars) that shows in the email.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Request-to-join (approval-required plans)
        </Typography>
        <Bullet>
          When the host enables approval, anyone reaching the plan via random discovery (Explore, community, plain URL) must submit a short
          message to request a spot. The host approves or declines from the plan page.
        </Bullet>
        <Bullet>
          <strong>Bypassed by host-extended access:</strong> existing RSVPs, direct invites, valid <code>invite_token</code> (email links), and
          valid <code>share_token</code> (Copy Link) all skip Request-to-join and go straight to the normal RSVP buttons. The host generated
          the share link, so its holder is treated as host-granted access. The same bypass set applies to invite-only visibility.
        </Bullet>
        <Bullet>
          <strong>Approve:</strong> adds the requester as Going (capacity-checked) and sends an approval email.
          <strong> Decline:</strong> sends a decline email. The decline email uses approximate location only (see Emails below).
        </Bullet>
        <Bullet>
          Requesters can withdraw a pending request themselves.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Host removes an attendee
        </Typography>
        <Bullet>
          The host can remove an attendee from the plan. This deletes their RSVP and any confirmation, sends a notification email, and logs the
          removal for moderation/metrics.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Plan chat" subtitle="Who can see and post in a plan&rsquo;s group chat">
        <Bullet>
          <strong>Who can chat:</strong> the <strong>host</strong> and attendees with RSVP <strong>Going</strong>. People on Maybe, Can&rsquo;t make
          it, or removed have no chat access and cannot read history.
        </Bullet>
        <Bullet>
          <strong>Auto-lock:</strong> chat becomes read-only 3 days after the plan&rsquo;s start time.
        </Bullet>
        <Bullet>
          <strong>Canceled plans:</strong> chat is hidden.
        </Bullet>
        <Bullet>
          <strong>Unread indicators:</strong> bell/tab counts show unread messages; a daily <strong>Unread chat digest</strong> batches them by email
          (see Emails).
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Attendance checks and auto-cancel" subtitle="24-hour confirmation window and when plans cancel themselves">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          24-hour attendance check (opt-in per plan)
        </Typography>
        <Bullet>
          Host turns on <strong>Reconfirmation</strong> and sets a minimum confirmed-attendees count and a fallback policy
          (<em>Proceed</em>, <em>Notify host</em>, or <em>Auto-cancel</em>).
        </Bullet>
        <Bullet>
          Approximately <strong>24 hours before</strong> start: every Going attendee (including host) gets a confirmation request. Reminders are sent
          at ~12 hours and ~3 hours before start to anyone still unconfirmed.
        </Bullet>
        <Bullet>
          Attendees confirm either in-app on the plan page or via the confirmation email (which deep-links to the confirmation section).
        </Bullet>
        <Bullet>
          At <strong>cutoff</strong> (~2 hours before start), the system counts confirmations. Below the minimum:
        </Bullet>
        <Bullet>
          &bull; <strong>Auto-cancel:</strong> plan is canceled, all attendees notified by email. The cancel banner and per-attendee confirmation
          badges remain visible on the plan page so the reason is clear.
        </Bullet>
        <Bullet>
          &bull; <strong>Notify host:</strong> host gets an &ldquo;at risk&rdquo; email with the confirmed count vs minimum. Plan continues.
        </Bullet>
        <Bullet>
          &bull; <strong>Proceed:</strong> nothing extra; plan continues.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Minimum attendees required (opt-in per plan)
        </Typography>
        <Bullet>
          Optional simpler RSVP-based threshold. If the host sets a number, the plan auto-cancels 2 hours before start when fewer than that many
          people are Going (host counts toward the total, same as the goingCount everywhere else). Independent of the 24-hour attendance check above:
          a plan can use either, both, or neither. Cancellation reason is <code>min_attendees_required_not_met</code>.
        </Bullet>
        <Bullet>
          When both checks would cancel the same plan in the same cron tick, the plan is only cancelled once and each recipient gets a single
          cancellation email. Plans cancelled this way do not penalize the host&rsquo;s host-completion / host-follow-through metrics.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          No-attendees auto-cancel (always on)
        </Typography>
        <Bullet>
          If the start time passes and no one other than the host is Going, the plan is silently auto-canceled (reason <code>no_attendees</code>).
          No email is sent; this is cleanup for plans that effectively never happened.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Host cancellation
        </Typography>
        <Bullet>
          The host can cancel at any time. Going and Maybe attendees are notified by email (subject to the <em>Plan canceled or changed</em> pref).
          The email CTA points to the plan detail page, not the homepage.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Emails and digests" subtitle="What gets sent, to whom, and how location is redacted">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Digest emails
        </Typography>
        <Bullet>
          <strong>Unread chat digest:</strong> once per day at most, to users with unread messages in plans they&rsquo;re on.
          Gated by the <em>Unread messages in your plans</em> preference.
        </Bullet>
        <Bullet>
          <strong>Event match digest:</strong> once per day at most, to users with a home location and the <em>New plans matching my interests</em> pref on.
          Filters: hobby overlap, within travel radius, in-person, future, room left, two-directional chum-preference check, &ldquo;already connected&rdquo;
          suppression (skipped if the recipient already has any RSVP or invite on the plan). Chums-only plans additionally require the recipient to be
          in the host&rsquo;s On NewChums. Invite-only plans never appear.
        </Bullet>
        <Bullet>
          <strong>Post-plan feedback reminder:</strong> ~3 hours after a plan ends, to host and Going attendees. One per plan. Gated by the
          <em> Feedback requests</em> pref.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Change / cancel / at-risk emails
        </Typography>
        <Bullet>
          <strong>Plan changed:</strong> to Going/Maybe (not the host, not Can&rsquo;t-make-it). Gated by <em>Plan canceled or changed</em>.
        </Bullet>
        <Bullet>
          <strong>Plan canceled (host or auto-cancel):</strong> same recipients, same pref. CTA points to the plan detail page so the cancel banner and
          reason are visible, not to the homepage.
        </Bullet>
        <Bullet>
          <strong>At-risk (notify-host policy):</strong> to the host only when confirmations are below minimum at cutoff. CTA jumps to the
          confirmation section of the plan.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Exact-location privacy in emails
        </Typography>
        <Bullet>
          Email location is rendered through a single helper that chooses between <strong>approximate</strong> (area only) and <strong>exact</strong>
          (full address, venue name, online link) based on recipient role.
        </Bullet>
        <Bullet>
          <strong>Approximate-only path:</strong> invite emails to people who haven&rsquo;t joined, digest emails, and <strong>declined join-request</strong>
          emails. No exact address or online link is ever in these.
        </Bullet>
        <Bullet>
          <strong>Exact path (joined recipients):</strong> confirmation, reminder, approval, and &ldquo;you&rsquo;re Going&rdquo; emails to attendees
          include the exact address or online join link.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          QA plans in email
        </Typography>
        <Bullet>
          Cron jobs still process QA plans for confirmation, digest, and feedback emails, but only super-admin recipients are included.
          Normal users never receive email about a QA plan.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Postmark caveat (internal)
        </Typography>
        <Bullet>
          Email bodies live as Postmark templates, not in this repo. Template text changes happen in the Postmark dashboard;
          code changes only affect the data that gets merged in. If the wording in a real email doesn&rsquo;t match what you expect, check Postmark
          before assuming a bug.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Communities and community plans" subtitle="Public vs private, joining, plan feeds, metadata privacy">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Core shape
        </Typography>
        <Bullet>
          A community is a group page with a unique handle, a hobby or two, and either a physical location or an online presence. The creator is the
          owner. Super admins can manage any community.
        </Bullet>
        <Bullet>
          Optional: website link, online join link (e.g. Discord), operating hours, logo, banner.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Access
        </Typography>
        <Bullet>
          <strong>Public community:</strong> anyone can find it, see its members and plans, and join immediately (Open) or submit a request (Approval).
        </Bullet>
        <Bullet>
          <strong>Private community:</strong> discoverable, but non-members see only a locked preview (name, description, hobbies, member count,
          upcoming-plan count). Members and plans are hidden.
        </Bullet>
        <Bullet>
          <strong>Logged-out visitors</strong> of private communities see the same restricted preview.
          <strong> Website, Discord/join link, and operating hours are hidden</strong> from non-members of private communities; they remain visible to
          members and to anyone on public communities.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Join requests (Approval mode)
        </Typography>
        <Bullet>
          Requesters add an optional short message. The owner gets one in-app notification and one email per request. The requester gets email on
          approve or decline.
        </Bullet>
        <Bullet>
          <strong>7-day cooldown:</strong> a pending request can be resent after 7 days; the existing row is refreshed in place. Within the 7-day
          window the resend button is hidden so owners aren&rsquo;t pinged repeatedly.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Community plan feed
        </Typography>
        <Bullet>
          The community&rsquo;s plan feed still honors each plan&rsquo;s base visibility. A chums-only plan in a community is visible only to the
          host&rsquo;s chums even inside the community feed. Invite-only plans cannot be linked to a community.
        </Bullet>
        <Bullet>
          <strong>Only show this plan to community members</strong> (per-plan) narrows <strong>Explore only</strong>, not the community feed.
          Directly invited non-members can still open and join the plan; it&rsquo;s a discovery gate, not a participation gate.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Metadata / link previews
        </Typography>
        <Bullet>
          Private community pages return <strong>noindex</strong> and a <strong>generic OG description</strong> (e.g. &ldquo;View this private
          community on NewChums.&rdquo;). Member counts, website, and Discord/join link are not embedded in link previews.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Premium modules (Community Pro)
        </Typography>
        <Bullet>
          A community inherits Community Pro from its <strong>owner&rsquo;s</strong> subscription plan. If the owner is downgraded, those communities
          lose Pro access.
        </Bullet>
        <Bullet>
          <strong>Currently gated as Pro:</strong> nothing yet. Community banner upload was moved to Free; community chat is the planned first Pro
          feature when it ships. Everything else (website link, Discord link, operating hours, plan feed, join requests, etc.) is free for all
          communities today.
        </Bullet>
        <Bullet>
          Premium modules that aren&rsquo;t available are <strong>hidden</strong> in the UI, not shown as locked.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Ownership cap
        </Typography>
        <Bullet>
          Every user can own at most <strong>5 active</strong> communities regardless of plan. Closing a community frees a slot. Community chat is
          deferred; the schema flag exists but no implementation ships yet.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="QR redirects" subtitle="Printed posters and cards as a small inventory">
        <Bullet>
          Each QR code is a row in <strong>Admin &rsaquo; QR Codes</strong> and resolves to <code>https://newchums.com/qr/CODE</code>.
          The printed URL is permanent; the destination can be edited any time without reprinting.
        </Bullet>
        <Bullet>
          Metadata per row: <strong>Media type</strong> (Card / Poster), <strong>Assigned store</strong> (free-form), <strong>Variant</strong> (campaign
          tag), <strong>Active</strong> (off redirects to homepage), and the destination URL.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Scan logging
        </Typography>
        <Bullet>
          Each scan logs approximate geo (country, region, city from Cloudflare), timezone, user-agent, and referer.
          <strong> No raw IP is stored.</strong>
        </Bullet>
        <Bullet>
          Three dedupe rules so counts reflect real humans:
        </Bullet>
        <Bullet>
          &bull; <strong>HEAD requests</strong> (browser preflight / QR preview) don&rsquo;t count; redirect still resolves.
        </Bullet>
        <Bullet>
          &bull; <strong>Known bots and unfurlers</strong> (Slackbot, Discordbot, Twitterbot, FacebookExternalHit, WhatsApp, LinkedInBot, search
          crawlers, curl/wget, headless Chrome) are filtered out by user-agent.
        </Bullet>
        <Bullet>
          &bull; <strong>Same device within 30 seconds</strong> collapses to one scan (camera double-fire, accidental retap).
        </Bullet>
        <Bullet>
          The redirect itself is never affected by these rules; they only change what&rsquo;s logged.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Using QR data during pilots
        </Typography>
        <Bullet>
          Treat scan counts as directional (&ldquo;store A poster outperformed store B&rdquo;) not absolute. Use Media type + Store + Variant to
          compare creatives, placements, and venues.
        </Bullet>
        <Bullet>
          <strong>Not content pages:</strong> <code>/qr/*</code> is a redirect (no HTML to index), and the Admin QR pages sit under the authenticated
          shell (noindex). Don&rsquo;t treat QR URLs as SEO surfaces.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Signup, login, and legal acceptance" subtitle="Account creation paths, OAuth legal fallback, suspended accounts">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Signup paths
        </Typography>
        <Bullet>
          <strong>Email / password:</strong> email, password, and legal acceptance first; then username and date of birth; then optional hobbies
          and location.
        </Bullet>
        <Bullet>
          <strong>Google OAuth:</strong> legal acceptance before OAuth redirect, then the same onboarding (username, DOB, optional hobbies / location).
        </Bullet>
        <Bullet>
          <strong>Lightweight signup (share / invite link):</strong> email + DOB + legal; account created via magic link with
          <code> password_setup_pending = true</code>. A non-blocking banner later prompts the user to set a password.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Legal acceptance fallback
        </Typography>
        <Bullet>
          If a signed-in user lands in the app with no recorded legal acceptance (historical OAuth edge case), the app-shell layout redirects them to
          an <strong>Accept legal</strong> interstitial before they can use other surfaces. This is the safety net for OAuth users who came in before
          the acceptance step was required.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Login paths
        </Typography>
        <Bullet>
          <strong>Email / password</strong> or <strong>Google</strong> for returning users with those credentials.
        </Bullet>
        <Bullet>
          <strong>Email me a sign-in link</strong> appears at <code>/login</code> when the email on file has no password yet (typical for lightweight
          signups). It sends a dedicated &ldquo;Sign in to NewChums&rdquo; email (Postmark template 44802964, distinct from the lightweight-signup
          confirmation template) and lands the recipient on <code>/settings#account</code> after sign-in so they can finish setting a password in
          one step.
        </Bullet>
        <Bullet>
          <strong>Wrong session:</strong> clicking a magic link while signed in as a different account signs out the current session and completes
          the magic-link flow.
        </Bullet>
        <Bullet>
          <strong>Post-credentials redirect:</strong> after password login, the app does a full-page navigation (not a client-side route change) to
          avoid a cached pre-login layout. Operator signal: if login &ldquo;works but the UI still looks logged out,&rdquo; that protection has
          regressed.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Suspended accounts
        </Typography>
        <Bullet>
          Super admins can mark an account suspended. Login is refused with an <em>AccountSuspended</em> error; the user sees a suspended message
          rather than landing in the app.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Funnel visibility in the Users tab
        </Typography>
        <Bullet>
          The Users table shows a setup-status chip per row, derived from existing fields (no extra tracking). Priority order:
          <strong> Suspended</strong> &rsaquo; <strong>Email unverified</strong> (<code>email_verified_at IS NULL</code>) &rsaquo;
          <strong> Password setup pending</strong> (<code>password_setup_pending = true</code>) &rsaquo;
          <strong> No plan activity</strong> (verified, has password, zero RSVPs and zero hosted plans) &rsaquo; <strong>Active</strong>.
        </Bullet>
        <Bullet>
          A small subtitle under the chip shows plan activity (e.g. <em>3 RSVPs &middot; 1 hosted</em> or <em>No plan activity</em>) so a stuck
          lightweight signup is obvious at a glance. <em>Email unverified</em> and <em>Password setup pending</em> are the funnel drop-off signals
          for share / invite-link visitors.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Subscriptions and premium access" subtitle="Free, Super Host, Community Pro, what&rsquo;s actually gated today">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Plans and access model
        </Typography>
        <Bullet>
          Three tiers: <strong>Free</strong>, <strong>Super Host</strong>, <strong>Community Pro</strong>. Community Pro includes Super Host.
        </Bullet>
        <Bullet>
          Plans are <strong>assigned manually</strong> by super admins from the Users tab. There is <strong>no billing, no checkout, no self-service
          upgrade</strong> yet. Changes are logged for audit.
        </Bullet>
        <Bullet>
          The public-facing <strong>Your Plan</strong> page is informational (explains tiers and current access). It is not a sales page and has no
          upgrade CTA.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          What&rsquo;s actually gated today
        </Typography>
        <Bullet>
          <strong>Community Pro:</strong> nothing today. The framework exists (<code>hasCommunityProAccess</code>,{" "}
          <code>communityInheritsProAccess</code>) and is reserved for future community-level features. Community banner upload was moved to Free.
        </Bullet>
        <Bullet>
          <strong>Super Host:</strong> framework exists (<code>hasSuperHostAccess</code>), but no plan / organizer features are currently gated to it.
          Don&rsquo;t claim Super Host benefits during pilot support that aren&rsquo;t actually wired.
        </Bullet>
        <Bullet>
          The 5-active-communities ownership cap applies to <strong>everyone</strong>, regardless of plan.
        </Bullet>
        <Bullet>
          Premium modules that aren&rsquo;t available to a user are <strong>hidden</strong> in the UI, not shown as locked.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Public privacy and indexing" subtitle="What logged-out visitors and search engines can see">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Public profile (<code>/u/&lt;handle&gt;</code>)
        </Typography>
        <Bullet>
          <strong>Logged-out:</strong> handle only (no display name), no age, no gender, no reliability scores. Activity counts (plans attended,
          plans hosted) are shown.
        </Bullet>
        <Bullet>
          <strong>Logged-in:</strong> full detail minus whatever the profile owner has hidden via Settings toggles.
        </Bullet>
        <Bullet>
          Privacy toggles in Settings: hide from NewChums search, hide my profile from search engines (<em>noindex</em>), hide age, hide my
          connections on my public profile, hide me from other people&rsquo;s connection lists, hide shout-outs.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Indexing (noindex) rules
        </Typography>
        <Bullet>
          <strong>Not indexable:</strong> authenticated app shell (anything under <code>/(app)</code>), admin pages, <code>/qr/*</code> (redirect, not
          content), private community pages, public profiles with the &ldquo;hide from search engines&rdquo; toggle on, non-public plans
          (chums-only and invite-only).
        </Bullet>
        <Bullet>
          <strong>Indexable:</strong> marketing pages (homepage, How it Works, Safety Center), public plan pages (<code>visibility = public</code>),
          and the public <strong>/roadmap</strong> page.
        </Bullet>
        <Bullet>
          Public plan pages and previews never expose exact address, online join link, or attendee identities (including not via Open Graph tags).
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Feedback and attendance record" subtitle="Prompts after a plan and the public attendance record">
        <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
          Feedback prompts
        </Typography>
        <Bullet>
          After a plan&rsquo;s start time, a <em>How did it go?</em> section appears on the plan detail for host + Going attendees. A reminder email is
          sent ~3 hours after plan end (once per plan, gated by the Feedback requests pref).
        </Bullet>
        <Bullet>
          <strong>Each attendee rates (Agree / Maybe / Disagree):</strong> Reliability, Sociability, Cleanliness &amp; Consideration, Match Quality.
          Only for the host: <strong>Hosting Skills</strong>. All prompts are optional; users can&rsquo;t self-rate.
        </Bullet>
        <Bullet>
          Feedback nudges hidden scores (baseline 50) with a weighted-average formula: new users move fast, established users barely budge per
          rating. Clamped to [0, 100].
        </Bullet>
        <Bullet>
          <strong>Attendance issues</strong> (No-show / Arrived very late / Cancelled too late) are reported via a separate dialog. They apply a flat,
          additive penalty to Reliability scaled by <strong>reporter confidence</strong>: host report = full penalty, non-host = 75% until corroborated
          by a second attendee, disputed by the subject = 50%, admin-dismissed = 0.
        </Bullet>
        <Bullet>
          <strong>Conduct / safety reports</strong> are a separate flow. They don&rsquo;t touch any score; they email the admin team immediately and
          appear in the Safety admin tab.
        </Bullet>

        <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, mb: 0.5 }}>
          Public attendance record (<code>/u/&lt;handle&gt;</code>)
        </Typography>
        <Bullet>
          <strong>Shows up:</strong> share of past Going plans with no unresolved no-show / very-late attendance issue.
        </Bullet>
        <Bullet>
          <strong>Going follow-through:</strong> how often a Going RSVP stays Going (rather than getting flipped to Maybe/Can&rsquo;t at the last
          minute).
        </Bullet>
        <Bullet>
          <strong>Attendance checks answered:</strong> response rate to 24-hour confirmation requests.
        </Bullet>
        <Bullet>
          <strong>Host follow-through:</strong> share of hosted plans that completed. System auto-cancellations for <code>no_attendees</code> or <code>min_attendees_required_not_met</code> are excluded so the host isn&rsquo;t penalized for cases where the system pulled the plug.
        </Bullet>
        <Bullet>
          <strong>Plans attended / Plans hosted:</strong> activity counts. Shown even when logged-out; the reliability metrics above are hidden from
          logged-out viewers.
        </Bullet>
        <Bullet>
          QA plans are <strong>excluded</strong> from all public metrics.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Shout-outs" subtitle="Moderated positive notes between participants on past plans">
        <Bullet>
          On a past plan&rsquo;s feedback card, a reviewer can optionally write a short (up to 280 chars) shout-out for one other participant. One
          per <em>(plan, sender, recipient)</em> tuple. Purely additive; no effect on any metric.
        </Bullet>
        <Bullet>
          <strong>Moderated by super admins</strong> from the Shout-outs admin tab. Approve/reject are single-click.
          Approved: recipient gets a bell notification (no email) and sees it in their private &ldquo;Shout-outs received&rdquo; section on /profile.
          Rejected: no notification; never visible to the recipient.
        </Bullet>
        <Bullet>
          In v1, shout-outs are <strong>not</strong> shown on public profiles.
        </Bullet>
        <Bullet>
          Serious safety / conduct issues belong in the Safety report flow, not shout-outs.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Chum preferences" subtitle="Matching dimensions and how they filter Explore and digests">
        <Bullet>
          Five dimensions: <strong>Reliability</strong>, <strong>Sociability</strong>, <strong>Cleanliness &amp; Consideration</strong>,
          <strong> Hosting Skills</strong>, and <strong>Age range</strong>. All non-visible to other users; affect who gets matched <em>into</em>
          your plans and who appears in your digest.
        </Bullet>
        <Bullet>
          <strong>Tolerance levels</strong> (numeric dimensions): Open to anyone / Preferred (&ge;35) / Important (&ge;45) / Required (&ge;55).
          <strong> Age range:</strong> Any age / Within 5 / 10 / 15 years. Users without DOB always pass the age check.
        </Bullet>
        <Bullet>
          <strong>Event match digest:</strong> two-directional hard filter (host must pass viewer&rsquo;s thresholds <em>and</em> viewer must pass
          host&rsquo;s).
        </Bullet>
        <Bullet>
          <strong>Explore:</strong> the host&rsquo;s preferences hard-filter the feed. The viewer&rsquo;s preferences become a soft compatibility note
          on each card; plans aren&rsquo;t hidden for the viewer.
        </Bullet>
        <Bullet>
          <strong>Plan-level overrides:</strong> a host can disable chum-preference filtering for a specific plan (all dimensions or individual ones).
          Overrides only affect outbound matching; viewers still see their own compatibility notes.
        </Bullet>
        <Bullet>
          New-user defaults: Reliability = Preferred, others = Open, Age range = Any. Setting everything to permissive is the canonical &ldquo;off&rdquo;
          state (there is no separate master toggle).
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Connections (On NewChums and Private Contacts)" subtitle="How the chum list and private-contact list work">
        <Bullet>
          <strong>On NewChums:</strong> people who have NewChums accounts. One-way list; adding someone does not notify them or add you to their list.
          Used for chums-only visibility and digest eligibility. Shown on your public profile unless you hide it.
        </Bullet>
        <Bullet>
          <strong>Private Contacts:</strong> people not on NewChums, stored privately for your own planning. Never shown on profiles.
        </Bullet>
        <Bullet>
          <strong>Auto-link:</strong> when a private contact signs up with the matching email, they automatically appear in your On NewChums list,
          with any private notes preserved.
        </Bullet>
        <Bullet>
          The old <em>mutual chums</em> model has been removed. Adding someone is one-way, private, and does not imply reciprocity.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="QA plans" subtitle="Super-admin plans that don&rsquo;t leak into the real product">
        <Bullet>
          Super admins can mark a plan as <strong>QA</strong> on create or edit. QA plans are fully functional for admins (RSVP, chat, confirmation,
          feedback) but invisible to everyone else.
        </Bullet>
        <Bullet>
          <strong>Hidden from:</strong> Explore (including public Explore), community feeds, Your Plans for non-admins, notifications, and all emails
          to non-admins. Direct-URL access returns 404 for non-admins.
        </Bullet>
        <Bullet>
          <strong>Excluded from:</strong> KPI metrics and public attendance-record calculations.
        </Bullet>
        <Bullet>
          Cron jobs (attendance checks, digests, feedback reminders) still run on QA plans but email only super-admin recipients.
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection
        title="Objectives and next-best-step nudges"
        subtitle="The onboarding / retention nudge above the page"
      >
        <Bullet>
          A single nudge above the page content shows the user their next recommended step. Sequence-aware; advances automatically as earlier steps
          complete.
        </Bullet>
        <Bullet>
          Current order: Add name &rarr; Add hobbies &rarr; Set location &rarr; Set travel distance &rarr; Write a bio &rarr; Add a profile picture
          &rarr; Join a plan &rarr; Attend a plan &rarr; Say hello in chat &rarr; Give feedback &rarr; Create a plan &rarr; Add a chum.
        </Bullet>
        <Bullet>
          Users can dismiss the nudge for a session (X) or turn off tutorial tips entirely (re-enabled from Settings &rsaquo; Tips &amp; guidance).
          The nudge never appears on super-admin pages.
        </Bullet>
        <Bullet>
          Evaluated from live product data (profile fields, RSVPs, contacts, chat, feedback). Completions are also recorded for analytics
          (User Diagnostics, KPI tab funnel).
        </Bullet>
      </CollapsibleSection>

      <CollapsibleSection title="Admin operations notes" subtitle="What this page is and where deeper detail lives">
        <Bullet>
          This page is an <strong>operator reference</strong> for pilot support, testing, and debugging real-world flows. It&rsquo;s intentionally
          high-level: outcomes and rules, not endpoints or schemas.
        </Bullet>
        <Bullet>
          For endpoints, database fields, and template IDs: <strong>docs/Technical_Specs.md</strong>. For product direction, visibility contracts,
          and UI rules: <strong>AGENTS.md</strong>. For architecture diagrams and data flow: <strong>docs/System_Map.md</strong>.
          For local setup: <strong>docs/Development_Setup_Guide.md</strong>.
        </Bullet>
        <Bullet>
          When product behavior changes, update this page in the same change set so it stays trustworthy during pilots.
        </Bullet>
      </CollapsibleSection>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", mt: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Want endpoints, database names, or the exact email templates? That lives in the repo docs (e.g. Technical_Specs). This page is the friendly
          operator-facing version.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: "block", mt: 1.5 }}>
          <strong>Maintainers:</strong> when product behavior changes (plans, emails, notifications, digests, communities, subscriptions, privacy, QR),
          review this tab in the <strong>same change set</strong> and keep it accurate. Keep it to key logic, plain language, and short bullets; see
          <strong> AGENTS.md</strong> (System Logic).
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
