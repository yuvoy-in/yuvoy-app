import { http } from "msw";
import {
  FOLLOW_LIMIT,
  PEOPLE_SAYS,
  UUID,
  followsOf,
  json,
  mayWrite,
  noContent,
  peopleGate,
  refusal,
  scenarioOf,
  sessionOf,
  setFollows,
  shownClub,
  url,
} from "./follow-state";

/**
 * Following a group (yuvoy-mobile#392): `GET /me/club-follows`,
 * `PUT` and `DELETE /me/club-follows/{clubId}`, refused in the API's order
 * (yuvoy-api handler/club_follows.go and the store's FollowClub):
 *
 *   1. no sign-in session: 401;
 *   2. People store down (`clubs-unavailable`): 503;
 *   3. People closed to the caller: 404 "People isn't open to your account yet.";
 *   4. a clubId that is not a uuid: 404 "We couldn't find that group.";
 *   5. follow only: the adult answer (403), the standing (403
 *      `people_paused`), the first name (409 `name_required`);
 *   6. follow only: a group not shown: 404 "We couldn't find that group.";
 *   7. follow only: already followed is 204, else past 200 follows is 409
 *      `follow_limit_reached`.
 *
 * Unfollow is 204 for any uuid, followed or not. Scenarios: `follow-state.ts`.
 */

/** Steps 1 to 4, shared by both writes. */
function writeGate(
  request: Request,
  scenario: string,
  clubId: string,
): Response | null {
  const no = peopleGate(request, scenario);
  if (no) return no;
  if (!UUID.test(clubId)) return refusal(404, "not_found", PEOPLE_SAYS.gone);
  return null;
}

export const followHandlers = [
  http.get(url("/me/club-follows"), ({ request }) => {
    const scenario = scenarioOf(request);
    const no = peopleGate(request, scenario);
    if (no) return no;
    if (scenario === "club-follows-down") {
      return refusal(500, "internal_error", PEOPLE_SAYS.fault);
    }
    const ids = followsOf(scenario, sessionOf(request)!).filter((id) =>
      shownClub(id),
    );
    return json({ clubIds: ids, clubs: ids.map((id) => shownClub(id)!) });
  }),

  http.put(url("/me/club-follows/:clubId"), ({ request, params }) => {
    const scenario = scenarioOf(request);
    const clubId = String(params.clubId);
    const no = writeGate(request, scenario, clubId) ?? mayWrite(scenario);
    if (no) return no;
    const club = shownClub(clubId);
    if (
      !club ||
      scenario === "club-follows-gone" ||
      scenario === "clubs-hidden-meanwhile"
    ) {
      return refusal(404, "not_found", PEOPLE_SAYS.gone);
    }
    const session = sessionOf(request)!;
    const ids = followsOf(scenario, session);
    if (ids.includes(club.clubId)) return noContent();
    if (ids.length >= FOLLOW_LIMIT) {
      return refusal(409, "follow_limit_reached", PEOPLE_SAYS.limit);
    }
    setFollows(scenario, session, [club.clubId, ...ids]);
    return noContent();
  }),

  http.delete(url("/me/club-follows/:clubId"), ({ request, params }) => {
    const scenario = scenarioOf(request);
    const clubId = String(params.clubId).toLowerCase();
    const no = writeGate(request, scenario, clubId);
    if (no) return no;
    const session = sessionOf(request)!;
    setFollows(
      scenario,
      session,
      followsOf(scenario, session).filter((id) => id !== clubId),
    );
    return noContent();
  }),
];
