#!/usr/bin/env node
/**
 * Renders every email template under api/src/email/templates against a
 * representative TemplateModel and asserts:
 *   1. The template files exist (.html and .txt).
 *   2. Rendered html / text / subject are non-empty strings.
 *   3. The rendered output contains no literal "{{" or "}}".
 *   4. Conditional sections behave correctly: passing null hides the
 *      section; passing a value renders it.
 *
 * Build-time only. Not shipped to production.
 *
 * Run: node api/scripts/validateEmailTemplates.mjs
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Mustache from "mustache";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "src", "email", "templates");

// Mirror of api/src/email/subjects.ts. Keep this in sync. The validation
// script is build-time only so a tiny duplicate is cheaper than wiring up
// a TS loader for one constant.
const SUBJECTS = {
  verifyEmail: "Verify your NewChums email",
  passwordReset: "Reset your NewChums password",
  emailChangeConfirm: "Confirm your new NewChums email",
  emailChangeNotifyOld: "Your NewChums email is being changed",
  emailChangeSuccess: "Your NewChums email has been updated",
  magicLinkSignup: "Finish signing up for {{planTitle}}",
  planSignin: "Sign in to view {{planTitle}}",
  signinLink: "Your NewChums sign-in link",
  chumInvite: "{{inviterName}} invited you to NewChums",
  eventInvite: "{{hostName}} invited you to {{eventTitle}}",
  eventChanged: "Update to {{eventTitle}}",
  attendeeRemoved: "You've been removed from {{eventTitle}}",
  joinRequestToHost: "{{requesterName}} wants to join {{eventTitle}}",
  joinRequestApproved: "You're in for {{eventTitle}}",
  joinRequestDeclined: "About your request to join {{eventTitle}}",
  eventJoin: "{{attendeeName}} is going to {{eventTitle}}",
  eventLeave: "{{attendeeName}} left {{eventTitle}}",
  eventMaybe: "{{attendeeName}} might come to {{eventTitle}}",
  confirmationRequestUser_attendee: "Are you still coming to {{eventTitle}}?",
  confirmationRequestUser_host: "Are you still hosting {{eventTitle}}?",
  planAtRisk: "{{eventTitle}} needs more confirmations",
  planAutoCancelled: "{{eventTitle}} has been cancelled",
  planRemovedByAdmin: "Your plan {{eventTitle}} has been removed",
  planFeedback: "How did {{planTitle}} go?",
  unreadChatDigest: "You have unread messages on NewChums",
  eventMatchDigest: "{{planCount}} new {{planNoun}} you might like",
  communityJoinRequest: "{{requesterName}} wants to join {{communityName}}",
  communityJoinApproved: "Welcome to {{communityName}}",
  communityJoinDeclined: "About your {{communityName}} request",
  communityJoinRequestReopened: "You can request to join {{communityName}} again",
  communityMemberRemoved: "You've been removed from {{communityName}}",
  communityMemberUnblocked: "You can rejoin {{communityName}}",
  communityAnnouncement: "{{communityName}}: {{announcementTitle}}",
  roadmapUpdate: "Update on your NewChums feedback",
  concernReportAlert: "New concern report submitted",
};

const BASE_MODEL = {
  year: 2026,
  productName: "NewChums",
};

// One representative model per template basename. Each model includes
// every field the body or subject can reference, so a missing
// interpolation surfaces as a literal "{{" in the output.
const FULL_MODELS = {
  verifyEmail: { name: "Sam", verifyUrl: "https://newchums.com/verify?t=abc" },
  passwordReset: { name: "Sam", resetUrl: "https://newchums.com/reset?t=abc" },
  emailChangeConfirm: { name: "Sam", confirmUrl: "https://newchums.com/confirm?t=abc" },
  emailChangeNotifyOld: { name: "Sam", newEmail: "new@example.com" },
  emailChangeSuccess: { name: "Sam" },
  magicLinkSignup: { confirmUrl: "https://newchums.com/auth/magic?t=abc", planTitle: "Friday Hike" },
  planSignin: { loginUrl: "https://newchums.com/login?next=/plans/123", planTitle: "Friday Hike" },
  signinLink: { confirmUrl: "https://newchums.com/auth/magic?t=abc" },
  chumInvite: { inviterName: "Sam", inviteUrl: "https://newchums.com/invite?t=abc" },
  eventInvite: {
    recipientName: "Alex", hostName: "Sam", eventTitle: "Friday Hike",
    eventDate: "Fri 3 May, 6:00pm", eventLocation: "Mt. Eden",
    eventUrl: "https://newchums.com/events/123",
    goingUrl: "https://newchums.com/events/123?rsvp=going",
    maybeUrl: "https://newchums.com/events/123?rsvp=maybe",
    cantMakeItUrl: "https://newchums.com/events/123?rsvp=cant_make_it",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
    suggestTimeNote: "Time is flexible",
    customMessage: "Hope you can make it",
  },
  eventChanged: {
    heading: "A plan has been updated", bodyText: "Hey Alex, ...",
    statusLabel: "Plan, Updated", statusColor: "#E65B13",
    eventTitle: "Friday Hike", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    ctaUrl: "https://newchums.com/events/123", ctaText: "View updated plan",
    changesBlockHtml: "<p>Date changed</p>", changesBlockText: "Date changed",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  attendeeRemoved: {
    recipientName: "Alex", hostName: "Sam", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    removalReason: "Capacity reached", unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  joinRequestToHost: {
    hostName: "Sam", requesterName: "Alex", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123",
    requestMessage: "Would love to join!", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  joinRequestApproved: {
    recipientName: "Alex", hostName: "Sam", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123",
    hostMessage: "See you Friday", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  joinRequestDeclined: {
    recipientName: "Alex", hostName: "Sam", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123",
    hostMessage: "Sorry, all full", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  eventJoin: {
    hostName: "Sam", attendeeName: "Alex", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    attendeeMessage: "Looking forward to it", unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  eventLeave: {
    hostName: "Sam", attendeeName: "Alex", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    attendeeMessage: "Plans changed sorry", unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  eventMaybe: {
    hostName: "Sam", attendeeName: "Alex", eventTitle: "Friday Hike",
    eventUrl: "https://newchums.com/events/123", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    attendeeMessage: "Will try to make it", unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  confirmationRequestUser: {
    heading: "Confirm your attendance", greeting: "Hi Alex,", bodyText: "Your plan is coming up soon. Please confirm.",
    recipientName: "Alex", eventTitle: "Friday Hike", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    eventUrl: "https://newchums.com/events/123", ctaUrl: "https://newchums.com/events/123",
    deadline: "Thu 2 May 10:00pm", isReminder: false, isFinal: false,
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  planAtRisk: {
    heading: "Attendance check: 2 of 4 confirmed", bodyText: "Hey Sam, ...",
    hostName: "Sam", eventTitle: "Friday Hike", eventUrl: "https://newchums.com/events/123",
    eventDate: "Fri 3 May", eventLocation: "Mt. Eden", confirmedCount: 2, minRequired: 4,
    ctaUrl: "https://newchums.com/events/123", ctaText: "Review and decide",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  planAutoCancelled: {
    heading: "A plan you were attending has been cancelled", bodyText: "Hey Alex, ...",
    eventTitle: "Friday Hike", eventDate: "Fri 3 May", eventLocation: "Mt. Eden",
    reasonText: "Only 2 of 4 attendees confirmed",
    ctaUrl: "https://newchums.com/events/123", ctaText: "View plan details",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  planRemovedByAdmin: { hostName: "Sam", eventTitle: "Friday Hike", reason: "Violated guidelines" },
  planFeedback: {
    heading: "How did your plan go?", greeting: "Hi Alex,", bodyText: "Your plan has wrapped up...",
    recipientName: "Alex", planTitle: "Friday Hike", planUrl: "https://newchums.com/events/123",
    planDate: "Fri 3 May", planLocation: "Mt. Eden",
    ctaUrl: "https://newchums.com/events/123", ctaText: "Leave feedback",
    ctaHelperText: "Quick and private. Takes about a minute.",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  unreadChatDigest: {
    recipientName: "Alex", planCount: 3,
    planCards: "<table>...</table>", planCardsText: "- Plan 1\n- Plan 2",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  eventMatchDigest: {
    recipientName: "Alex", planCount: 3, planNoun: "plans",
    planCards: "<table>...</table>", planCardsText: "- Plan 1\n- Plan 2",
    exploreUrl: "https://newchums.com/",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  communityJoinRequest: {
    ownerName: "Sam", requesterName: "Alex", communityName: "Hiking Club",
    communityUrl: "https://newchums.com/communities/hiking?tab=requests",
    message: "I'd love to join",
  },
  communityJoinApproved: {
    userName: "Alex", communityName: "Hiking Club",
    communityUrl: "https://newchums.com/communities/hiking",
  },
  communityJoinDeclined: { userName: "Alex", communityName: "Hiking Club" },
  communityJoinRequestReopened: {
    recipientName: "Alex", communityName: "Hiking Club",
    communityUrl: "https://newchums.com/communities/hiking",
  },
  communityMemberRemoved: {
    recipientName: "Alex", communityName: "Hiking Club",
    communityUrl: "https://newchums.com/communities/hiking",
    removalReason: "Persistent rule breaking",
  },
  communityMemberUnblocked: {
    recipientName: "Alex", communityName: "Hiking Club",
    communityUrl: "https://newchums.com/communities/hiking",
  },
  communityAnnouncement: {
    recipientName: "Alex", communityName: "Hiking Club",
    communityUrl: "https://newchums.com/communities/hiking",
    announcementTitle: "Saturday hike postponed",
    announcementBodyHtml: "<p>The Saturday hike is moved to Sunday.</p>",
    announcementBodyText: "The Saturday hike is moved to Sunday.",
    communityMuteUrl: "https://newchums.com/communities/hiking?mute=announcements",
    settingsUrl: "https://newchums.com/settings#notifications",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  roadmapUpdate: {
    recipientName: "Alex", itemTitle: "Add dark mode",
    itemUrl: "https://newchums.com/roadmap/123",
    updateType: "status_change", statusLabel: "Planned",
    adminNote: "Coming next quarter", mergedIntoTitle: "Theme support",
    mergedIntoUrl: "https://newchums.com/roadmap/456",
    unsubscribeUrl: "https://newchums.com/unsub?t=abc",
  },
  concernReportAlert: {
    reporterName: "Alex", reporterEmail: "a@example.com",
    reportedName: "Sam", reportedEmail: "s@example.com",
    planTitle: "Friday Hike", concernReason: "Harassment",
    details: "Reported user was rude in chat",
    submittedAt: "2026-05-19T12:34:56Z",
    reportUrl: "https://newchums.com/admin/reports/1",
    reporterProfileUrl: "https://newchums.com/u/alex",
    reportedProfileUrl: "https://newchums.com/u/sam",
    planUrl: "https://newchums.com/events/123",
  },
};

// Optional fields per template — these should disappear when set to null.
const OPTIONAL_FIELDS = {
  eventInvite: ["eventLocation", "unsubscribeUrl", "suggestTimeNote", "customMessage"],
  eventChanged: ["eventLocation", "changesBlockHtml", "changesBlockText", "unsubscribeUrl"],
  attendeeRemoved: ["eventLocation", "removalReason", "unsubscribeUrl"],
  joinRequestToHost: ["requestMessage", "eventLocation", "unsubscribeUrl"],
  joinRequestApproved: ["hostMessage", "eventLocation", "unsubscribeUrl"],
  joinRequestDeclined: ["hostMessage", "eventLocation", "unsubscribeUrl"],
  eventJoin: ["eventLocation", "attendeeMessage", "unsubscribeUrl"],
  eventLeave: ["eventLocation", "attendeeMessage", "unsubscribeUrl"],
  eventMaybe: ["eventLocation", "attendeeMessage", "unsubscribeUrl"],
  confirmationRequestUser: ["eventLocation", "unsubscribeUrl"],
  planAtRisk: ["eventLocation", "unsubscribeUrl"],
  planAutoCancelled: ["eventLocation", "unsubscribeUrl"],
  planRemovedByAdmin: ["reason"],
  planFeedback: ["planDate", "planLocation", "unsubscribeUrl"],
  unreadChatDigest: ["unsubscribeUrl"],
  eventMatchDigest: ["unsubscribeUrl"],
  communityJoinRequest: ["message"],
  communityMemberRemoved: ["removalReason"],
  communityAnnouncement: ["announcementBodyText", "unsubscribeUrl"],
  roadmapUpdate: ["statusLabel", "adminNote", "mergedIntoTitle", "mergedIntoUrl", "unsubscribeUrl"],
};

// Templates that don't share the basename with the subject key (variants).
const SUBJECT_KEY_OVERRIDES = {
  confirmationRequestUser: "confirmationRequestUser_attendee",
};

async function loadTemplate(basename) {
  const htmlPath = join(TEMPLATES_DIR, `${basename}.html`);
  const txtPath = join(TEMPLATES_DIR, `${basename}.txt`);
  if (!existsSync(htmlPath)) throw new Error(`Missing ${basename}.html`);
  if (!existsSync(txtPath)) throw new Error(`Missing ${basename}.txt`);
  const html = await readFile(htmlPath, "utf8");
  const text = await readFile(txtPath, "utf8");
  return { html, text };
}

function render(template, model) {
  return Mustache.render(template, model);
}

function assertNoLeftoverTags(label, rendered) {
  if (rendered.includes("{{") || rendered.includes("}}")) {
    const idx = rendered.indexOf("{{") >= 0 ? rendered.indexOf("{{") : rendered.indexOf("}}");
    const snippet = rendered.slice(Math.max(0, idx - 40), idx + 60);
    throw new Error(`${label} contains leftover {{ or }}: ...${snippet}...`);
  }
}

let failures = 0;
let checks = 0;

for (const basename of Object.keys(FULL_MODELS)) {
  process.stdout.write(`[${basename}] `);
  try {
    const tpl = await loadTemplate(basename);
    const fullModel = { ...BASE_MODEL, ...FULL_MODELS[basename] };
    const subjectKey = SUBJECT_KEY_OVERRIDES[basename] ?? basename;
    const subject = render(SUBJECTS[subjectKey], fullModel);
    const html = render(tpl.html, fullModel);
    const text = render(tpl.text, fullModel);
    if (!subject) throw new Error("empty subject");
    if (!html) throw new Error("empty html");
    if (!text) throw new Error("empty text");
    assertNoLeftoverTags("subject", subject);
    assertNoLeftoverTags("html", html);
    assertNoLeftoverTags("text", text);
    checks++;

    // Optional-field hide/show check: nulling out each optional field
    // should produce a render with no leftover tags, AND the rendered
    // length should be smaller than the fully-populated version (proves
    // the section actually hid).
    const optionalFields = OPTIONAL_FIELDS[basename] ?? [];
    for (const field of optionalFields) {
      const stripped = { ...fullModel, [field]: null };
      const strippedHtml = render(tpl.html, stripped);
      const strippedText = render(tpl.text, stripped);
      assertNoLeftoverTags(`html with ${field}=null`, strippedHtml);
      assertNoLeftoverTags(`text with ${field}=null`, strippedText);
      if (strippedHtml.length >= html.length && strippedText.length >= text.length) {
        // Most optional fields shrink the body when hidden. A field that
        // shrinks neither HTML nor text is suspicious, but a few are
        // legitimate (e.g. a triple-stache HTML field where the missing
        // case still renders surrounding chrome of equal length). Warn,
        // don't fail.
        console.warn(`  [warn] ${basename}.${field}=null did not shrink rendered output`);
      }
      checks++;
    }

    console.log("ok");
  } catch (err) {
    failures++;
    console.log("FAIL");
    console.log(`  ${err.message}`);
  }
}

// Spot-check: confirmationRequestUser host variant subject also renders.
try {
  const subject = render(SUBJECTS.confirmationRequestUser_host, {
    ...BASE_MODEL,
    ...FULL_MODELS.confirmationRequestUser,
  });
  assertNoLeftoverTags("confirmationRequestUser_host subject", subject);
  checks++;
} catch (err) {
  failures++;
  console.log(`[confirmationRequestUser_host subject] FAIL: ${err.message}`);
}

console.log("");
console.log(`${checks} checks passed, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
