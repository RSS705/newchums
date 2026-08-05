/**
 * Curated example plans for the logged-out home page public Explore feed when
 * GET /events/explore/public returns no rows, and for the read-only
 * /sample-plan/[id] demo pages those cards (and the homepage hero card) open.
 *
 * Rebalanced Aug 2026 with the host-first repositioning: the old lineup was
 * four game-store activities out of six. Games stay (real users run MTG
 * nights), but the spread now reads "anyone who organizes": game night and
 * potluck, a trail walk, a book club, Commander, bowling, pottery.
 *
 * Banners are the product's own deterministic gradients (bannerUrl null →
 * EventCard and the sample page fall back to getGradientForEventId), exactly
 * what a real plan without a photo looks like. The stock activity photos are
 * gone with the repositioning.
 *
 * Sample id 0001 is special: the homepage hero card renders a miniature of
 * it and links to it, promising "Game Night & Potluck, Saturday, 6:30 PM,
 * Riverside Park Pavilion, 8 going, 4 seats remaining". Its entry below must
 * keep those facts (the date is computed as the next Saturday so the promise
 * stays true on any day), and `web/src/components/landing/HeroPlanCard.tsx`
 * must change in step with it.
 *
 * Edit this file to revise copy; dates are generated relative to "now" so
 * cards always read as upcoming.
 */

import type { PlanEvent } from "@/components/events/EventCard";

/** Stable ids: gradient banners derive from them, the ui-survey and the
 *  homepage hero link to 0001 directly. Do not reshuffle. */
const IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
] as const;

/** One made-up person on a sample plan. Avatar files live in
 *  /public/images/sample-avatars (a generated flat, faceless set). */
export type SamplePerson = {
  name: string;
  avatar: string;
  status: "going" | "maybe";
  confirmed: boolean;
};

export type SamplePlanDetails = {
  hostName: string;
  hostAvatar: string;
  people: SamplePerson[];
  chat: { who: string; avatar: string; text: string }[];
};

const AV = (n: number) => `/images/sample-avatars/av-${String(n).padStart(2, "0")}.svg`;

/**
 * Returns six sample public plans with realistic host-first copy.
 * @param now - optional anchor for tests
 */
export function getSamplePublicExplorePlans(now = new Date()): PlanEvent[] {
  // Spread starts across the next ~3 weeks so the grid feels varied
  const d0 = (days: number, h = 14, m = 0) => {
    const x = new Date(now);
    x.setDate(x.getDate() + days);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  // The hero card says "Saturday · 6:30 PM"; keep that literally true.
  const nextSaturday = (h: number, m: number) => {
    const x = new Date(now);
    const ahead = (6 - x.getDay() + 7) % 7 || 7;
    x.setDate(x.getDate() + ahead);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };

  const plans: PlanEvent[] = [
    // 1 – The homepage hero's plan (see the header comment before editing)
    {
      id: IDS[0],
      title: "Game Night & Potluck",
      description: null,
      startsAt: nextSaturday(18, 30),
      locationType: "in_person",
      locationDisplay: "Riverside Park Pavilion, London, ON",
      locationName: "Riverside Park Pavilion",
      locationAddress: "Riverside Park, London, ON",
      onlineLink: null,
      maxSeats: 12,
      visibility: "public",
      status: "published",
      hobby: "Board games",
      hobbySlug: "board-games",
      hobbies: [{ name: "Board games", slug: "board-games" }],
      hostName: "@martamakesplans",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 8,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: null,
    },
    // 2 – Card games (kept: real NewChums groups run Commander and cube nights)
    {
      id: IDS[1],
      title: "Casual Commander night (MTG)",
      description: null,
      startsAt: d0(9, 18),
      locationType: "in_person",
      locationDisplay: "The Game Chamber, 525 First St, London, ON N5V 1Z5",
      locationName: "The Game Chamber",
      locationAddress: "525 First St, London, ON N5V 1Z5",
      onlineLink: null,
      maxSeats: 4,
      visibility: "public",
      status: "published",
      hobby: "Card games",
      hobbySlug: "card-games",
      hobbies: [{ name: "Card games", slug: "card-games" }],
      hostName: "@deckbuilder",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 3,
      maybeCount: 0,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: null,
    },
    // 3 – Book club
    {
      id: IDS[2],
      title: "Neighbourhood book club night",
      description: null,
      startsAt: d0(12, 19),
      locationType: "in_person",
      locationDisplay: "Fire Roasted Coffee Co., 630 Dundas St, London, ON",
      locationName: "Fire Roasted Coffee Co.",
      locationAddress: "630 Dundas St, London, ON",
      onlineLink: null,
      maxSeats: 10,
      visibility: "public",
      status: "published",
      hobby: "Books",
      hobbySlug: "books",
      hobbies: [{ name: "Books", slug: "books" }],
      hostName: "@margaretreads",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 6,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: null,
    },
    // 4 – Trail walk ("Saturday" in the title, so generated on one)
    {
      id: IDS[3],
      title: "Saturday trail walk, coffee after",
      description: null,
      startsAt: nextSaturday(9, 0),
      locationType: "in_person",
      locationDisplay: "Sifton Bog trailhead, Oxford St W, London, ON",
      locationName: "Sifton Bog trailhead",
      locationAddress: "Oxford St W, London, ON",
      onlineLink: null,
      maxSeats: null,
      visibility: "public",
      status: "published",
      hobby: "Hiking",
      hobbySlug: "hiking",
      hobbies: [{ name: "Hiking", slug: "hiking" }],
      hostName: "@trailheadtom",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 5,
      maybeCount: 2,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: null,
    },
    // 5 – Bowling
    {
      id: IDS[4],
      title: "Weekend bowling hangout",
      description: null,
      // "Weekend" in the title, so it lands on Saturday too (morning lanes,
      // while the potluck up top has the evening).
      startsAt: nextSaturday(10, 0),
      locationType: "in_person",
      locationDisplay: "Palasad South, 141 Pine Valley Blvd, London, ON N6K 3T6",
      locationName: "Palasad South",
      locationAddress: "141 Pine Valley Blvd, London, ON N6K 3T6",
      onlineLink: null,
      maxSeats: 10,
      visibility: "public",
      status: "published",
      hobby: "Bowling",
      hobbySlug: "bowling",
      hobbies: [{ name: "Bowling", slug: "bowling" }],
      hostName: "@linework",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 6,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: null,
    },
    // 6 – Pottery
    {
      id: IDS[5],
      title: "Pottery studio hangout",
      description: null,
      startsAt: d0(14, 15),
      locationType: "in_person",
      locationDisplay: "4Cats Arts Studio, 1255 Commissioners Rd W, London, ON N6K 3N5",
      locationName: "4Cats Arts Studio",
      locationAddress: "1255 Commissioners Rd W, London, ON N6K 3N5",
      onlineLink: null,
      maxSeats: 5,
      visibility: "public",
      status: "published",
      hobby: "Pottery",
      hobbySlug: "pottery",
      hobbies: [{ name: "Pottery", slug: "pottery" }],
      hostName: "@kilnstories",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 3,
      maybeCount: 0,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: null,
    },
  ];

  return plans;
}

/**
 * Per-plan people and chat for the sample plan pages. Every plan used to
 * share one hard-coded cast and transcript, which fell apart the moment
 * someone opened two samples. Counts here are the source of truth the page
 * derives its "N going, M maybe" line from; keep each plan's list consistent
 * with the card's goingCount/maybeCount above.
 */
export const SAMPLE_PLAN_DETAILS: Record<string, SamplePlanDetails> = {
  [IDS[0]]: {
    hostName: "Marta",
    hostAvatar: AV(2),
    people: [
      { name: "Priya", avatar: AV(3), status: "going", confirmed: true },
      { name: "Marcus", avatar: AV(5), status: "going", confirmed: true },
      { name: "Elena", avatar: AV(6), status: "going", confirmed: true },
      { name: "Sam", avatar: AV(7), status: "going", confirmed: true },
      { name: "Naomi", avatar: AV(4), status: "going", confirmed: true },
      { name: "Dev", avatar: AV(9), status: "going", confirmed: true },
      { name: "Victor", avatar: AV(12), status: "going", confirmed: false },
      { name: "June", avatar: AV(8), status: "going", confirmed: false },
      { name: "Kofi", avatar: AV(10), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Priya", avatar: AV(3), text: "I've got lasagna covered, and I'm bringing Ticket to Ride." },
      { who: "Marcus", avatar: AV(5), text: "Bean salad from me. Anyone need a ride from the north end?" },
      { who: "Elena", avatar: AV(6), text: "I can take two people, leaving around 6." },
      { who: "Marta", avatar: AV(2), text: "Pavilion is ours from 6. Bring a sweater, it cools off by the water." },
    ],
  },
  [IDS[1]]: {
    hostName: "Theo",
    hostAvatar: AV(11),
    people: [
      { name: "Ravi", avatar: AV(9), status: "going", confirmed: true },
      { name: "Jess", avatar: AV(1), status: "going", confirmed: true },
      { name: "Colin", avatar: AV(12), status: "going", confirmed: false },
    ],
    chat: [
      { who: "Ravi", avatar: AV(9), text: "Bringing three decks, power level around six." },
      { who: "Jess", avatar: AV(1), text: "My partner wants to try Commander. Beginner friendly?" },
      { who: "Theo", avatar: AV(11), text: "Absolutely. I'll bring a loaner deck, we'll teach as we go." },
    ],
  },
  [IDS[2]]: {
    hostName: "Margaret",
    hostAvatar: AV(13),
    people: [
      { name: "Alice", avatar: AV(1), status: "going", confirmed: true },
      { name: "Tom", avatar: AV(5), status: "going", confirmed: true },
      { name: "Grace", avatar: AV(4), status: "going", confirmed: true },
      { name: "Omar", avatar: AV(10), status: "going", confirmed: true },
      { name: "Fern", avatar: AV(6), status: "going", confirmed: false },
      { name: "Lucas", avatar: AV(14), status: "going", confirmed: false },
      { name: "Rosa", avatar: AV(8), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Alice", avatar: AV(1), text: "Halfway through. No spoilers past chapter twelve, please." },
      { who: "Tom", avatar: AV(5), text: "I'll grab our usual corner table and order a pot of tea." },
      { who: "Grace", avatar: AV(4), text: "Bringing my sister along, she just finished it in two days." },
      { who: "Margaret", avatar: AV(13), text: "Wonderful. Next month's shortlist is pinned on the plan page." },
    ],
  },
  [IDS[3]]: {
    hostName: "Tom",
    hostAvatar: AV(14),
    people: [
      { name: "Hana", avatar: AV(2), status: "going", confirmed: true },
      { name: "Pete", avatar: AV(12), status: "going", confirmed: true },
      { name: "Sylvie", avatar: AV(6), status: "going", confirmed: true },
      { name: "Andre", avatar: AV(9), status: "going", confirmed: false },
      { name: "Bea", avatar: AV(3), status: "going", confirmed: false },
      { name: "Noor", avatar: AV(4), status: "maybe", confirmed: false },
      { name: "Stan", avatar: AV(5), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Hana", avatar: AV(2), text: "Meeting at the trailhead lot at nine sharp?" },
      { who: "Tom", avatar: AV(14), text: "Nine sharp. Easy pace, about an hour, coffee at Locomotive after." },
      { who: "Pete", avatar: AV(12), text: "Are leashed dogs alright? Biscuit needs the exercise." },
      { who: "Tom", avatar: AV(14), text: "Leashed dogs very welcome." },
    ],
  },
  [IDS[4]]: {
    hostName: "Dana",
    hostAvatar: AV(8),
    people: [
      { name: "Mike", avatar: AV(5), status: "going", confirmed: true },
      { name: "Steph", avatar: AV(1), status: "going", confirmed: true },
      { name: "Jordan", avatar: AV(10), status: "going", confirmed: true },
      { name: "Kelly", avatar: AV(2), status: "going", confirmed: true },
      { name: "Ben", avatar: AV(12), status: "going", confirmed: false },
      { name: "Ada", avatar: AV(6), status: "going", confirmed: false },
      { name: "Ray", avatar: AV(14), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Dana", avatar: AV(8), text: "Two lanes booked under Dana for ten o'clock." },
      { who: "Steph", avatar: AV(1), text: "Fair warning, I haven't bowled since high school." },
      { who: "Mike", avatar: AV(5), text: "Shoe rental is four dollars, bring a loonie for the lockers." },
    ],
  },
  [IDS[5]]: {
    hostName: "Ines",
    hostAvatar: AV(4),
    people: [
      { name: "Wren", avatar: AV(6), status: "going", confirmed: true },
      { name: "Paulo", avatar: AV(9), status: "going", confirmed: true },
      { name: "Maya", avatar: AV(3), status: "going", confirmed: false },
    ],
    chat: [
      { who: "Wren", avatar: AV(6), text: "First time doing pottery, genuinely excited." },
      { who: "Ines", avatar: AV(4), text: "We'll do handbuilding, no wheel experience needed. Studio fee covers clay and one firing." },
      { who: "Paulo", avatar: AV(9), text: "Do we pick pieces up the same day or after the kiln?" },
      { who: "Ines", avatar: AV(4), text: "About a week after, I'll post a pickup note here when they're ready." },
    ],
  },
};
