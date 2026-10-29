import { getResponse, http, type RequestHandler } from "msw";
import { CHECKED_NOW } from "./found-checked-fixtures";
import { onR3Clock } from "./found-handlers";

/**
 * One clock under R3's scenarios (yuvoy-app#180).
 *
 * The app learns the API's clock from the `Date` header of EVERY answer, and
 * the latest one wins (`src/lib/booking/clock.ts`). Under R3's scenarios the
 * found routes stand at `CHECKED_NOW`, while every other route dates its
 * answer by `mockNow()`, two and a half days earlier. So which day the page
 * counted Coming up's two weeks from depended on which answer came last: the
 * real API has one clock, and so must the mock's world.
 *
 * Put first, this answers any request under those scenarios with what the
 * rest of `routes` answer, dated `CHECKED_NOW`. A request none of them takes
 * falls through as before; so does a network error, which has no headers.
 */
export function checkedClock(routes: readonly RequestHandler[]) {
  return http.all("*", async ({ request }) => {
    if (!onR3Clock(scenarioOf(request))) return undefined;
    const answer = await getResponse([...routes], request);
    if (!answer || answer.type === "error") return answer;
    const headers = new Headers(answer.headers);
    headers.set("date", new Date(CHECKED_NOW).toUTCString());
    return new Response(answer.body, {
      status: answer.status,
      statusText: answer.statusText,
      headers,
    });
  });
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    ""
  );
}
