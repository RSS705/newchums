# Future Ideas Reference (Do Not Execute)

> ⚠️ **Important – For Human Reference Only**
>
> This document contains exploratory ideas, future enhancements, UX thoughts, and potential experiments for NewChums.
>
> - These notes are **not approved features**
> - They are **not part of the current sprint**
> - They must **not be implemented automatically**
> - They must **never be modified by AI agents**
>
> This file exists purely as a strategic idea bank maintained manually by Robert.
>
> AI agents (including Cursor) may read this file for context about long-term direction, but must **not treat anything here as requirements** unless explicitly instructed in a prompt.

---

## How To Use This Document

- Ideas are grouped by **View / Feature Area**
- Entries are intentionally short and directional
- Some ideas may contradict each other
- Inclusion here does **not** mean priority
- Many ideas may never be built

This document is meant to:

- Capture creative momentum
- Prevent idea loss
- Support long-term product clarity
- Reduce cognitive load during active development

---

# Ideas by View

---

## Sign Up

- During the sign up, collect hobbies with notification option, and location, using a multi-step sign up, which is skippable if desired.

## Non-Logged in Home

- Add a section which explains how the app makes coordinating with existing friends easier.
- Home page, get together easier with family. Coordinate.

---

## Sign Up Process

- Modify sign-up flow to ask:
  - Do you want to set up hobbies now?
  - Do you want to set up your location radius?
  - Do you want to set chum preferences?
- Explore lightweight onboarding checklist with progress bar

---

## Explore

- Add subtle “New near you” indicator
- Experiment with soft social proof (e.g., “3 people you share interests with joined this”)
- Interest-based sorting toggle
- “Try something new” discovery suggestion block
- XP reward for first event joined

---

## Profile

- Section to specify what kind of chums you are looking for.

- Public vs private profile toggle
- Profile completeness indicator
- Soft gamification (levels, badges)
- Gamification, only next unlockable at each level shown.
- Badge for inviting someone else into the app.

---

## Create Event

- Smart suggested locations based on user interests
- Pre-filled templates (Board Game Night, Coffee Walk, Study Session, etc.)
- Suggested minimum/maximum capacity guidance
- Friction check: “Would you attend this?”
- A way to invite people to an event by email.
- Option for people to request a different date or time.
- Need a robust coordination tool, works per event. Host gives date and times slots, guests indicate their date and time slots, host picks.

---

## Your Plans

- Countdown timer until event
- Shared group chat (lightweight)
- Simple RSVP status clarity improvements
- Event recap / memory capture post-event

---

## Your Chums

- Friend strength indicator (based on shared events)
- Suggested follow-up prompts
- “Reconnect” reminders

---

## Monetization

- Premium profile highlights
- Featured event boost
- Business event pages
- Local partner integrations

---

## General

- We need ways for the user to invest into the app. Build interest lists, pin events, add to Chums, get feedback for events, define chum preferences, etc.
- Notification of one of their chums joins something they might be interested in

---

# Experiments / Wild Ideas

- AI event suggestion engine
- XP unlockable features
- “Host score” reputation system
- Event streak mechanic
- Anonymous feedback after events

# Metrics

# Early Success Metrics for NewChums

These metrics help determine whether the platform is gaining real traction once events are live.

They should eventually appear in **Super Admin analytics views**, but do not need to be implemented yet.

---

## 1. Events Created per Active User

**Purpose**  
Measures whether users are willing to host events and whether the platform can generate enough event supply.

**Formula**

Events created in period ÷ Active users in same period

**Healthy Early Range**

0.1 – 0.3

Meaning **10–30% of active users create events**.

**Example**

100 active users  
15 events created  
= 0.15 (healthy)

If the value falls **below ~0.05**, the platform may struggle to generate enough events.

---

## 2. Invite Conversion Rate

**Purpose**  
Measures how effectively event invitations bring new users into the platform.

**Formula**

New accounts created from event invites ÷ Total invites sent

Includes:

- Email invites
- Shared event links

**Healthy Early Range**

10% – 30%

**Example**

50 invites sent  
10 new accounts created  
= 20% conversion

Low conversion may indicate:

- unclear event pages
- signup friction
- weak event descriptions

---

## 3. Event Attendance Rate

**Purpose**  
Measures whether events are compelling enough for people to actually attend.

**Formula**

RSVP yes (or actual attendees) ÷ Total event page views

**Healthy Early Range**

10% – 25%

**Example**

40 event page views  
8 RSVPs  
= 20% attendance rate

Low attendance may indicate:

- weak event descriptions
- inconvenient event timing/location
- low trust in early platform usage

---

## Bonus Metric (Most Predictive)

### Repeat Event Participation

**Purpose**  
Measures whether attendees return to the platform after their first event.

**Formula**

Users who attend a second event ÷ Users who attended a first event

**Healthy Early Range**

40% – 60%

If people attend one event and return for another, the platform is likely delivering real value.

---

## Key Principle

NewChums success should be measured by **successful gatherings**, not simply total users.

Strong events naturally lead to:

- repeat usage
- friendships forming
- more event hosts
- organic platform growth

## Full UI Redesign Someday

- RPG-inspired website concept: Reframe the landing page as a small journey/world rather than a standard SaaS page.
- Hero idea: A slightly pixelated or pixel-inspired porch/wilderness scene with a path leading toward town, symbolizing leaving home to join real-life gatherings.
- Plans/events section: Present event cards as a village notice board / town job board, with themed framing but still clear modern UX underneath.
- Implementation approach: Keep the product UI readable and modern; use the RPG theme mostly through background scenes, section metaphors, decorative assets, and layout composition, not through heavy game-like controls.
- Best style direction: Prefer pixel-inspired over full retro UI, so the site feels memorable and charming without becoming confusing or gimmicky.
- Key caution: Avoid turning all copy and controls into fantasy/game language; let the environment/metaphor carry the theme while the product messaging stays clear and broad.
