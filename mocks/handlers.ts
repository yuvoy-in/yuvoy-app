import { bookingHandlers } from "./booking-handlers";
import { savedHandlers } from "./saved-handlers";
import { foundHandlers } from "./found-handlers";
import { checkedClock } from "./checked-clock";
import { tableHandlers } from "./table-handlers";
import { planHandlers } from "./plan-handlers";
import { exportHandlers } from "./export-handlers";
import { planLinkHandlers } from "./plan-link-handlers";
import { creatorLinkHandlers } from "./creator-link-handlers";
import { peopleHandlers } from "./people-handlers";
import { crewHandlers } from "./crew-handlers";
import { trigoHandlers } from "./trigo-handlers";
import { organiserHandlers } from "./organiser-handlers";
import { doorHandlers } from "./organiser-door";
import { meHandlers } from "./me-handlers";
import { followHandlers } from "./follow-handlers";
import { crewInviteHandlers } from "./crew-invite-handlers";
import { myPlansHandlers } from "./my-plans-handlers";
import { catalogRoutes } from "./handlers-catalog";
import { listingRoutes } from "./handlers-listings";
import { placeRoutes } from "./handlers-places";

export type { Scenario } from "./handlers-scenario";

/**
 * Handlers for every endpoint Phase 1 touches, plus a way to reach every
 * failure branch on purpose.
 *
 * The scenario switch is the point of this file. The states that lose money
 * are the ones nobody can reproduce, so any request can be forced into a
 * specific failure with `?__scenario=<name>` (or the `x-yuvoy-scenario`
 * header, which survives a redirect). Nothing here ships: MSW is dev and test
 * only, and `pnpm build` does not include it.
 */

const routes = [
  /*
    First, so its two trip-only listings answer before the catalog's
    `/experiences/:slug` says they do not exist (yuvoy-app#207).
  */
  ...creatorLinkHandlers,
  ...meHandlers,

  // Trigo, the chat (yuvoy-app#223). Before the organisers: see `PUT /me/age` there.
  ...trigoHandlers,
  /* Organiser pages and `PUT /me/age` (yuvoy-app#224). */
  ...organiserHandlers,
  /* The door, `POST /organiser-check-ins` (yuvoy-app#226). */
  ...doorHandlers,

  ...catalogRoutes,

  ...listingRoutes,

  ...placeRoutes,

  ...bookingHandlers,
  ...savedHandlers,
  ...foundHandlers,
  ...tableHandlers,
  // A member's plan: read, reply, leave, report (yuvoy-app#193).
  ...planHandlers,
  // A plan by its link (yuvoy-mobile#373), reached only through /p/api/.
  ...planLinkHandlers,
  // Download my data (yuvoy-app#221).
  ...exportHandlers,
  // People: friend requests and the friend link (yuvoy-app#222).
  ...peopleHandlers,
  // Crews: named lists of friends (yuvoy-app#227).
  ...crewHandlers,
  ...followHandlers,
  ...crewInviteHandlers,
  ...myPlansHandlers,
];

// Under R3's scenarios every answer is dated by their clock (`checked-clock.ts`).
export const handlers = [checkedClock(routes), ...routes];
