/**
 * Curated example plans for the logged-out home page public Explore feed when
 * GET /events/explore/public returns no rows. Not shown when real plans exist
 * or when the visitor filters/searches.
 *
 * Edit this file to revise copy; dates are generated relative to "now" so cards
 * always read as upcoming.
 */

import type { PlanEvent } from "@/components/events/EventCard";

/** Stable ids so gradient banner fallbacks stay consistent (sample plans have no `bannerKey`). */
const IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
] as const;

/**
 * Returns six sample public plans with realistic hobby-first copy.
 * @param now - optional anchor for tests
 */
export function getSamplePublicExplorePlans(now = new Date()): PlanEvent[] {
  // Spread starts across the next ~3 weeks so the grid feels varied
  const d0 = (days: number, h = 14) => {
    const x = new Date(now);
    x.setDate(x.getDate() + days);
    x.setHours(h, 0, 0, 0);
    return x.toISOString();
  };

  const plans: PlanEvent[] = [
    {
      id: IDS[0],
      title: "Casual board game night",
      description: null,
      startsAt: d0(5, 19),
      locationType: "in_person",
      locationDisplay:
        "Hex & Counter Café — 214 Harbor St, Suite B (near the waterfront)",
      locationName: null,
      locationAddress: null,
      onlineLink: null,
      maxSeats: 8,
      visibility: "public",
      status: "published",
      hobby: "Board games",
      hobbySlug: "board-games",
      hobbies: [{ name: "Board games", slug: "board-games" }],
      hostName: "@riveroak",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 5,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
    },
    {
      id: IDS[1],
      title: "Commander pod — bring a deck",
      description: null,
      startsAt: d0(9, 18),
      locationType: "in_person",
      locationDisplay: "Mana Vault Games — 4501 Division Rd, play area table 3",
      locationName: null,
      locationAddress: null,
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
    },
    {
      id: IDS[2],
      title: "D&D one-shot (beginners welcome)",
      description: null,
      startsAt: d0(12, 13),
      locationType: "in_person",
      locationDisplay: "Forge & Fiction — 88 Alder Ln, 2nd floor game lounge",
      locationName: null,
      locationAddress: null,
      onlineLink: null,
      maxSeats: 6,
      visibility: "public",
      status: "published",
      hobby: "D&D",
      hobbySlug: "d-and-d",
      hobbies: [{ name: "D&D", slug: "d-and-d" }],
      hostName: "@dungeonmoss",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 4,
      maybeCount: 2,
      distanceKm: null,
      bannerKey: null,
    },
    {
      id: IDS[3],
      title: "Chess in the park (casual)",
      description: null,
      startsAt: d0(3, 11),
      locationType: "in_person",
      locationDisplay: "Riverside Commons — south lawn, tables by the fountain",
      locationName: null,
      locationAddress: null,
      onlineLink: null,
      maxSeats: null,
      visibility: "public",
      status: "published",
      hobby: "Chess",
      hobbySlug: "chess",
      hobbies: [{ name: "Chess", slug: "chess" }],
      hostName: "@rookrunner",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 2,
      maybeCount: 0,
      distanceKm: null,
      bannerKey: null,
    },
    {
      id: IDS[4],
      title: "Saturday coffee & sketch",
      description: null,
      startsAt: d0(6, 10),
      locationType: "in_person",
      locationDisplay: "Sketch & Sip Studio — 19 Riverwalk Ave, window tables",
      locationName: null,
      locationAddress: null,
      onlineLink: null,
      maxSeats: 10,
      visibility: "public",
      status: "published",
      hobby: "Drawing",
      hobbySlug: "drawing",
      hobbies: [
        { name: "Drawing", slug: "drawing" },
        { name: "Photography", slug: "photography" },
      ],
      hostName: "@linework",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 6,
      maybeCount: 1,
      distanceKm: null,
      bannerKey: null,
    },
    {
      id: IDS[5],
      title: "Pottery studio open table",
      description: null,
      startsAt: d0(14, 15),
      locationType: "in_person",
      locationDisplay: "Clayhouse Collective — Studio 4, 220 Maker Blvd",
      locationName: null,
      locationAddress: null,
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
    },
  ];

  return plans;
}
