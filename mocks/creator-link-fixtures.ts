import type { components } from "../src/lib/api/schema.gen";

/**
 * A traveller's share links as `GET /me/creator-links` starts them
 * (yuvoy-app#207), apart from the handlers so `e2e/creator-links.spec.ts`
 * can name them without loading MSW.
 */

type CreatorLink = components["schemas"]["CreatorLink"];

/**
 * The links the list starts with, newest first, as the API sends them.
 *
 * The first has bookings and a latest one; the second has none, and its
 * listing is no longer listed (no fixture answers its slug), which must not
 * take the row or its counts away. Each row has one count of 1 and one
 * other, so both the singular and the plural are drawn ("1 booking",
 * "1 open").
 */
export const CREATOR_LINKS: readonly CreatorLink[] = [
  {
    code: "C-K7QM2XPA",
    link: "https://app.yuvoy.in/go/C-K7QM2XPA",
    target: {
      kind: "experience",
      id: "exp_night",
      slug: "night-fishing-with-a-local-crew",
      title: "Night fishing with a local crew",
    },
    createdAt: "2026-07-20T09:12:00Z",
    opens30Days: 14,
    opensTotal: 37,
    bookings: 1,
    lastBookingOn: "2026-08-09",
  },
  {
    code: "C-P3WN8RTE",
    link: "https://app.yuvoy.in/go/C-P3WN8RTE",
    target: {
      kind: "experience",
      id: "exp_glass_bottom",
      slug: "glass-bottom-boat-at-north-bay",
      title: "Glass-bottom boat at North Bay",
    },
    createdAt: "2026-06-11T05:40:00Z",
    opens30Days: 1,
    opensTotal: 11,
    bookings: 0,
  },
];
