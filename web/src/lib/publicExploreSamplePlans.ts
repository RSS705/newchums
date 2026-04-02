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
    // 1 – Game (board game)
    {
      id: IDS[0],
      title: "Game of settlers of catan",
      description: null,
      startsAt: d0(5, 19),
      locationType: "in_person",
      locationDisplay:
        "Game Knight Leagues, 38 Adelaide St N Unit 2A, London, ON N6B 3N5",
      locationName: "Game Knight Leagues",
      locationAddress: "38 Adelaide St N Unit 2A, London, ON N6B 3N5",
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
      bannerUrl: "/images/sample-plans/settlers-of-catan.jpg",
    },
    // 2 – Sport (pickleball)
    {
      id: IDS[3],
      title: "Pickleball meet up",
      description: null,
      startsAt: d0(3, 11),
      locationType: "in_person",
      locationDisplay:
        "Smash Pickleball, 1040 Wharncliffe Rd S, London, ON N6L 1H2",
      locationName: "Smash Pickleball",
      locationAddress: "1040 Wharncliffe Rd S, London, ON N6L 1H2",
      onlineLink: null,
      maxSeats: null,
      visibility: "public",
      status: "published",
      hobby: "Pickleball",
      hobbySlug: "pickleball",
      hobbies: [{ name: "Pickleball", slug: "pickleball" }],
      hostName: "@rookrunner",
      isHost: false,
      myRsvpStatus: null,
      goingCount: 2,
      maybeCount: 0,
      distanceKm: null,
      bannerKey: null,
      bannerUrl: "/images/sample-plans/pickleball.jpg",
    },
    // 3 – Game (card game)
    {
      id: IDS[1],
      title: "Casual game of commander",
      description: null,
      startsAt: d0(9, 18),
      locationType: "in_person",
      locationDisplay:
        "The Game Chamber, 525 First St, London, ON N5V 1Z5",
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
      bannerUrl: "/images/sample-plans/card-games.jpg",
    },
    // 4 – Sport (bowling)
    {
      id: IDS[4],
      title: "Bowling meetup",
      description: null,
      startsAt: d0(6, 10),
      locationType: "in_person",
      locationDisplay:
        "Palasad South, 141 Pine Valley Blvd, London, ON N6K 3T6",
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
      bannerUrl: "/images/sample-plans/bowling.jpg",
    },
    // 5 – Game (D&D)
    {
      id: IDS[2],
      title: "D&D one-shot (beginners welcome)",
      description: null,
      startsAt: d0(12, 13),
      locationType: "in_person",
      locationDisplay:
        "The Mana Lounge, 256 Dundas St, London, ON N6A 1H3",
      locationName: "The Mana Lounge",
      locationAddress: "256 Dundas St, London, ON N6A 1H3",
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
      bannerUrl: "/images/sample-plans/dnd.jpg",
    },
    // 6 – Craft (pottery)
    {
      id: IDS[5],
      title: "Pottery hangout",
      description: null,
      startsAt: d0(14, 15),
      locationType: "in_person",
      locationDisplay:
        "4Cats Arts Studio, 1255 Commissioners Rd W, London, ON N6K 3N5",
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
      bannerUrl: "/images/sample-plans/pottery.jpg",
    },
  ];

  return plans;
}
