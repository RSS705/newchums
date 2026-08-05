/**
 * Curated example plans for the logged-out home page public Explore feed when
 * GET /events/explore/public returns no rows, and for the read-only
 * /sample-plan/[id] demo pages those cards (and the homepage hero card) open.
 *
 * Lineup (Aug 2026, host-first repositioning, tuned to where the tool
 * shines: larger gatherings): a 14-seat game night and potluck, an 8-player
 * MTG cube draft, a monthly book club, a Saturday trail walk, an invite-only
 * backyard birthday BBQ, and a pottery hangout.
 *
 * Banners: each plan names a banner image under /images/sample-plans/.
 * Until the file exists, EventCard and the sample page fall back to the
 * product's deterministic gradient for the plan id, so images can land one
 * at a time with no code change (same pattern as the homepage photo band).
 *
 * Sample id 0001 is special: the homepage hero card renders a miniature of
 * it and links to it, promising "Game Night & Potluck, Saturday, 6:30 PM,
 * Riverside Park Pavilion, 10 going, 4 seats remaining". Its entry below
 * must keep those facts (the date is computed as the next Saturday so the
 * promise stays true on any day), and
 * `web/src/components/landing/HeroPlanCard.tsx` must change in step.
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

/** One made-up person on a sample plan. Avatars are the generated
 *  animal-and-object set in /public/images/sample-avatars: the earlier
 *  uniform-human set read as "this is all the system allows", and real
 *  people upload their dog, their dice, their coffee. */
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
  /** Shown on the location row when the exact address is held back. */
  locationPrivacyNote?: string;
  /** Optional read-only "Suggested alternative times" block, to show the
   *  scheduling feature off on plans where it makes sense. */
  altTimes?: {
    intro: string;
    entries: { when: string; names: string }[];
  };
  /** Skip the map embed (e.g. address withheld until joining). */
  hideMap?: boolean;
};

const AV = (name: string) => `/images/sample-avatars/${name}.svg`;

/**
 * Returns six sample plans with realistic host-first copy.
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
  // Titles that promise a day are generated on that day (the hero card
  // says "Saturday · 6:30 PM"; keep that literally true).
  const nextSaturday = (h: number, m: number) => {
    const x = new Date(now);
    const ahead = (6 - x.getDay() + 7) % 7 || 7;
    x.setDate(x.getDate() + ahead);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const nextSunday = (h: number, m: number) => {
    const x = new Date(now);
    const ahead = (7 - x.getDay()) % 7 || 7;
    x.setDate(x.getDate() + ahead);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };

  const plans: PlanEvent[] = [
    // 1 – The homepage hero's plan (see the header comment before editing).
    //     Party-scale board games: the tool shines with bigger groups.
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
      maxSeats: 14,
      visibility: "public",
      status: "published",
      hobby: "Board games",
      hobbySlug: "board-games",
      hobbies: [{ name: "Board games", slug: "board-games" }],
      hostName: "@martamakesplans",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 10,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: "/images/sample-plans/game-night-potluck.jpg",
    },
    // 2 – MTG cube draft: a full 8-player pod, the format real NewChums
    //     groups actually run.
    {
      id: IDS[1],
      title: "MTG Cube draft night (8 players)",
      description: null,
      startsAt: d0(9, 18),
      locationType: "in_person",
      locationDisplay: "The Game Chamber, 525 First St, London, ON N5V 1Z5",
      locationName: "The Game Chamber",
      locationAddress: "525 First St, London, ON N5V 1Z5",
      onlineLink: null,
      maxSeats: 8,
      visibility: "public",
      status: "published",
      hobby: "Card games",
      hobbySlug: "card-games",
      hobbies: [{ name: "Card games", slug: "card-games" }],
      hostName: "@deckbuilder",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 7,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: "/images/sample-plans/mtg-cube-draft.jpg",
    },
    // 3 – Book club
    {
      id: IDS[2],
      title: "Monthly book club night",
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
      bannerUrl: "/images/sample-plans/book-club.jpg",
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
      bannerUrl: "/images/sample-plans/trail-walk.jpg",
    },
    // 5 – Invite-only family birthday: the family-host archetype. Sunday
    //     afternoon, exact address held back, which also shows the
    //     location-privacy feature off.
    {
      id: IDS[4],
      title: "Backyard BBQ for Dad's 60th",
      description: null,
      startsAt: nextSunday(14, 0),
      locationType: "in_person",
      locationDisplay: "Old South, London, ON",
      locationName: null,
      locationAddress: null,
      onlineLink: null,
      maxSeats: null,
      visibility: "invite_only",
      status: "published",
      hobby: "Family",
      hobbySlug: "family",
      hobbies: [{ name: "Family", slug: "family" }],
      hostName: "@denisehosts",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 12,
      maybeCount: 2,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: "/images/sample-plans/birthday-bbq.jpg",
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
      maxSeats: 6,
      visibility: "public",
      status: "published",
      hobby: "Pottery",
      hobbySlug: "pottery",
      hobbies: [{ name: "Pottery", slug: "pottery" }],
      hostName: "@kilnstories",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 4,
      maybeCount: 0,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: "/images/sample-plans/pottery.jpg",
    },
  ];

  return plans;
}

/**
 * Per-plan people and chat for the sample plan pages. Counts here are the
 * source of truth the page derives its "N going, M maybe" line from; keep
 * each plan's list consistent with the card's goingCount/maybeCount above.
 */
export const SAMPLE_PLAN_DETAILS: Record<string, SamplePlanDetails> = {
  [IDS[0]]: {
    hostName: "Marta",
    hostAvatar: AV("fox"),
    people: [
      { name: "Priya", avatar: AV("owl"), status: "going", confirmed: true },
      { name: "Marcus", avatar: AV("coffee"), status: "going", confirmed: true },
      { name: "Elena", avatar: AV("plant"), status: "going", confirmed: true },
      { name: "Sam", avatar: AV("frog"), status: "going", confirmed: true },
      { name: "Naomi", avatar: AV("cat"), status: "going", confirmed: true },
      { name: "Dev", avatar: AV("d20"), status: "going", confirmed: true },
      { name: "June", avatar: AV("rabbit"), status: "going", confirmed: true },
      { name: "Victor", avatar: AV("camera"), status: "going", confirmed: false },
      { name: "Rosa", avatar: AV("bear"), status: "going", confirmed: false },
      { name: "Ken", avatar: AV("penguin"), status: "going", confirmed: false },
      { name: "Kofi", avatar: AV("guitar"), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Priya", avatar: AV("owl"), text: "Lasagna's claimed! And I'm bringing Ticket to Ride and Codenames." },
      { who: "Marcus", avatar: AV("coffee"), text: "Bean salad and my giant Jenga set. This is going to be so much fun!" },
      { who: "Elena", avatar: AV("plant"), text: "I can drive two people from the north end, just say the word." },
      { who: "Dev", avatar: AV("d20"), text: "Ten of us already? Best turnout yet!" },
      { who: "Marta", avatar: AV("fox"), text: "Pavilion's ours from 6. Bring a sweater for later, and your appetite. Can't wait to see everyone!" },
    ],
  },
  [IDS[1]]: {
    hostName: "Theo",
    hostAvatar: AV("d20"),
    people: [
      { name: "Ravi", avatar: AV("penguin"), status: "going", confirmed: true },
      { name: "Jess", avatar: AV("cat"), status: "going", confirmed: true },
      { name: "Colin", avatar: AV("camera"), status: "going", confirmed: true },
      { name: "Mei", avatar: AV("owl"), status: "going", confirmed: true },
      { name: "Aaron", avatar: AV("coffee"), status: "going", confirmed: true },
      { name: "Dana", avatar: AV("fox"), status: "going", confirmed: false },
      { name: "Luis", avatar: AV("bear"), status: "going", confirmed: false },
      { name: "Pav", avatar: AV("frog"), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Ravi", avatar: AV("penguin"), text: "Seven in the pod already! One seat left, tell your friends." },
      { who: "Jess", avatar: AV("cat"), text: "I've heard so much about this cube. Any preview of the archetypes?" },
      { who: "Theo", avatar: AV("d20"), text: "Freshly updated with the new set, and there's a spicy artifacts deck hiding in there. You'll see!" },
      { who: "Mei", avatar: AV("owl"), text: "Bringing sleeves and snacks. Let's go!" },
    ],
  },
  [IDS[2]]: {
    hostName: "Margaret",
    hostAvatar: AV("book"),
    people: [
      { name: "Alice", avatar: AV("plant"), status: "going", confirmed: true },
      { name: "Tom", avatar: AV("coffee"), status: "going", confirmed: true },
      { name: "Grace", avatar: AV("rabbit"), status: "going", confirmed: true },
      { name: "Omar", avatar: AV("owl"), status: "going", confirmed: true },
      { name: "Fern", avatar: AV("cat"), status: "going", confirmed: false },
      { name: "Lucas", avatar: AV("guitar"), status: "going", confirmed: false },
      { name: "Rosa", avatar: AV("frog"), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Alice", avatar: AV("plant"), text: "Finished it in three sittings. That ending! No spoilers, but wow." },
      { who: "Tom", avatar: AV("coffee"), text: "Our corner table is booked and I'm ordering the big pot of tea. So looking forward to this one." },
      { who: "Grace", avatar: AV("rabbit"), text: "Bringing my sister, she loved it too. Two more chapters for me tonight!" },
      { who: "Margaret", avatar: AV("book"), text: "Wonderful! Next month's shortlist is up, add your suggestions below." },
    ],
    altTimes: {
      intro: "A couple of members suggested times for next month's meetup. The host can make one official with a tap.",
      entries: [
        { when: "First Thursday, 7:00 PM", names: "Alice, Omar and 2 others" },
        { when: "First Sunday, 2:00 PM", names: "Grace, Fern" },
      ],
    },
  },
  [IDS[3]]: {
    hostName: "Tom",
    hostAvatar: AV("dog"),
    people: [
      { name: "Hana", avatar: AV("plant"), status: "going", confirmed: true },
      { name: "Pete", avatar: AV("camera"), status: "going", confirmed: true },
      { name: "Sylvie", avatar: AV("owl"), status: "going", confirmed: true },
      { name: "Andre", avatar: AV("frog"), status: "going", confirmed: false },
      { name: "Bea", avatar: AV("rabbit"), status: "going", confirmed: false },
      { name: "Noor", avatar: AV("cat"), status: "maybe", confirmed: false },
      { name: "Stan", avatar: AV("coffee"), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Hana", avatar: AV("plant"), text: "The bog is gorgeous right now, you picked the perfect week for this!" },
      { who: "Tom", avatar: AV("dog"), text: "Nine sharp at the trailhead lot! Easy pace, about an hour, then Locomotive for coffee. Biscuit is coming too." },
      { who: "Pete", avatar: AV("camera"), text: "Bringing the camera, the light through there in the morning is unreal." },
      { who: "Bea", avatar: AV("rabbit"), text: "First time out with this group, really excited to meet everyone!" },
    ],
  },
  [IDS[4]]: {
    hostName: "Denise",
    hostAvatar: AV("plant"),
    people: [
      { name: "Dad", avatar: AV("guitar"), status: "going", confirmed: true },
      { name: "Mike", avatar: AV("coffee"), status: "going", confirmed: true },
      { name: "Sarah", avatar: AV("cat"), status: "going", confirmed: true },
      { name: "Nana June", avatar: AV("rabbit"), status: "going", confirmed: true },
      { name: "Uncle Ray", avatar: AV("fox"), status: "going", confirmed: true },
      { name: "Kim", avatar: AV("owl"), status: "going", confirmed: true },
      { name: "Josh", avatar: AV("frog"), status: "going", confirmed: true },
      { name: "Amy", avatar: AV("penguin"), status: "going", confirmed: true },
      { name: "Cousin Lee", avatar: AV("camera"), status: "going", confirmed: false },
      { name: "Priya", avatar: AV("book"), status: "going", confirmed: false },
      { name: "Max", avatar: AV("d20"), status: "going", confirmed: false },
      { name: "Dana", avatar: AV("bear"), status: "going", confirmed: false },
      { name: "Aunt Carol", avatar: AV("plant"), status: "maybe", confirmed: false },
      { name: "Steve", avatar: AV("dog"), status: "maybe", confirmed: false },
    ],
    chat: [
      { who: "Mike", avatar: AV("coffee"), text: "Sixty years young! I've got the burgers and the big cooler covered." },
      { who: "Sarah", avatar: AV("cat"), text: "Cake is ordered, chocolate with the raspberry filling he loves. Shhh!" },
      { who: "Nana June", avatar: AV("rabbit"), text: "I'll bring my potato salad, wouldn't be a party without it." },
      { who: "Denise", avatar: AV("plant"), text: "You're all the best. Lawn games start at 2, speeches at 4, and whoever spoils the cake surprise does the dishes!" },
    ],
    locationPrivacyNote:
      "The exact address is shared with invited guests only. Everyone on this plan sees it; this preview shows the neighbourhood.",
    hideMap: true,
  },
  [IDS[5]]: {
    hostName: "Ines",
    hostAvatar: AV("bear"),
    people: [
      { name: "Wren", avatar: AV("plant"), status: "going", confirmed: true },
      { name: "Paulo", avatar: AV("guitar"), status: "going", confirmed: true },
      { name: "Maya", avatar: AV("cat"), status: "going", confirmed: false },
      { name: "Theo", avatar: AV("owl"), status: "going", confirmed: false },
    ],
    chat: [
      { who: "Wren", avatar: AV("plant"), text: "First time doing pottery and honestly counting down the days!" },
      { who: "Ines", avatar: AV("bear"), text: "You'll love it. Handbuilding this time, no wheel experience needed, and the studio fee covers clay and one firing." },
      { who: "Paulo", avatar: AV("guitar"), text: "My mug from last time survived the kiln. Going for a whole set now!" },
      { who: "Ines", avatar: AV("bear"), text: "Pieces are ready about a week after, I'll post a pickup note here." },
    ],
  },
};
