import { http, HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import { PEOPLE_SCENARIOS, setPeopleName } from "./people-state";
import { envelope, rid, scenarioOf, url } from "./booking-support";
import {
  DEV_SIGN_IN_CODE,
  MOCK_INVITE_CODES,
  admittedByCode,
  answerMe,
  isAdmitted,
  stayProblems,
  staysByCredential,
} from "./booking-account";

/*
  The sign-in, `/me`, invite-code and stay handlers, moved word for word
  from booking-handlers.ts (yuvoy-app#243). booking-handlers.ts lists them
  in their old place.
*/
export const authHandlers = [
  /* --------------------------------------------------------------- auth */

  /*
    There are deliberately NO /auth/otp/* handlers.

    That endpoint pair was deleted upstream on 2026-08-20 ("the second sign-in
    is deleted"). A mock for an endpoint the contract no longer has is worse
    than no mock: it is how somebody rebuilds a deleted feature against a shape
    that only exists on their laptop.

    `/me/sign-in/*` below is a DIFFERENT thing and is current (yuvoy-api#172):
    a session over a phone number, which any number can get whether or not it
    has ever booked, and which revokes nothing.
  */

  http.post(url("/me/sign-in/request"), async ({ request }) => {
    const body = (await request.json()) as { phone?: string };
    const phone = body.phone?.trim() ?? "";

    // E.164 or nothing. The real API is strict here and the screen has a
    // branch for it, so the mock has to be able to reach that branch.
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return envelope("invalid_input", "That is not a phone number.", 400);
    }
    // Reachable with `?__scenario=otp-rate-limited`, so the 429 copy is
    // testable without sending six codes.
    if (scenarioOf(request) === "otp-rate-limited") {
      return envelope("rate_limited", "Too many codes for that number.", 429);
    }

    /*
      202 and the API's own sentence, word for word (signInSent in the API's
      handler/traveller.go): since yuvoy-api#303 a code goes by email only to
      an address given while signed in as the number, on Account or with an
      invitation (yuvoy-api#195), never to one typed at a guest checkout. A
      number with none gets nothing, and the answer is the same for every
      number so it reveals none of that. The screens print this `message`, so
      the mock must carry the real one.
    */
    return HttpResponse.json(
      {
        sent: true,
        message:
          "If you gave us an email for this number while signed in, or with your invitation, a code is on its way to that email.",
        devCode: DEV_SIGN_IN_CODE,
      },
      { status: 202, headers: mockHeaders(rid()) },
    );
  }),

  http.post(url("/me/sign-in/verify"), async ({ request }) => {
    const body = (await request.json()) as { phone?: string; code?: string };
    const phone = body.phone?.trim() ?? "";
    const code = body.code?.trim() ?? "";

    if (!phone) {
      return envelope("invalid_input", "That is not a phone number.", 400);
    }
    /*
      "Wrong, expired, used and over-attempted codes all answer 401 with one
      message." One answer, deliberately: telling them apart would say whether
      a code had been issued for a number.
    */
    if (code !== DEV_SIGN_IN_CODE) {
      return envelope("unauthorized", "That code did not work.", 401);
    }
    /*
      A number that closed its account, with the erasure still open: a 403,
      and only after the code checked out, so it tells nobody without the
      code anything (`AccountDeletionPending`).
    */
    if (scenarioOf(request) === "account-deletion-pending") {
      return envelope(
        "account_deletion_pending",
        // The API's own words (yuvoy-api handler/account_deletion.go).
        "Your account is being deleted, so you cannot sign in. If you did not mean to close it, contact support.",
        403,
      );
    }

    return HttpResponse.json(
      {
        sessionToken: `sess_${phone.replace(/\D/g, "")}`,
        expiresAt: new Date(mockNow() + 30 * 24 * 60 * 60_000).toISOString(),
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/me/session"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    /*
      204 whatever the token was, including one already ended — so there is no
      server-side session to forget here. The mock deliberately keeps none: the
      real API's session is a token the client holds, and inventing a
      server-side record would let a test pass on state production does not
      have.
    */
    return new HttpResponse(null, { status: 204 });
  }),

  /*
    The Account tab, and the read every signed-in screen makes (yuvoy-api,
    14 Sep). `session.expiresAt` is what the cookie's life is set from: a
    traveller session lasts 14 days SINCE LAST USE, and this answers the
    current end rather than the one sign-in returned (yuvoy-app#57).

    `name` and `email` are null for a number with no profile, which is the
    common first-sign-in state and the one #32 and #38 branch on. The scenario
    switch reaches it without needing a second fixture number.
  */
  http.get(url("/me"), ({ request }) => answerMe(request)),

  /*
    Saving the profile (`updateMyAccount`), mocked only under the People
    scenarios (yuvoy-app#222), where the name step sends a first name and
    People reads `needsName` from it. The name is kept for the session and
    the answer is the account, as `GET /me` would send it now. Every other
    scenario passes through, as before.
  */
  http.patch(url("/me"), async ({ request }) => {
    const scenario = scenarioOf(request);
    if (!PEOPLE_SCENARIOS.has(scenario)) return undefined;
    const auth = request.headers.get("authorization");
    if (!auth) return envelope("unauthorized", "Sign in first.", 401);
    let body: { name?: unknown } | null = null;
    try {
      body = (await request.json()) as { name?: unknown } | null;
    } catch {
      body = null;
    }
    if (body?.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return envelope("invalid_input", "Add your name.", 400, {
          name: "Your name, as friends know you.",
        });
      }
      setPeopleName(auth, scenario, body.name);
    }
    return answerMe(request);
  }),

  /*
    Redeeming an invite code (yuvoy-api#195), modelled on the API as Hima
    described it on the issue and on the contract:

      - Signed in only. No `Authorization` is a 401, and a finished session
        is a 401 too (`?__scenario=session-expired`).
      - `?__scenario=invite-rate-limited` is the throttle: ten tries an hour
        per number and a limit per connection, answered `429`.
      - A number that is already admitted gets `200` with
        `alreadyAdmitted: true` WHATEVER it sends, even a malformed code, and
        the code is not used up.
      - Otherwise the code decides: `MOCK_INVITE_CODES.valid` admits the
        number, `.used` is `409 invite_code_used`, `.expired` is
        `410 invite_code_expired`, any other well-formed code is
        `404 invite_code_unknown`, and a malformed one is a `400`.

    The valid code is not consumed, unlike production's one-person-once.
    Two e2e projects run the same walk at the same time against one server,
    and a code that could be spent once would fail whichever came second.
    Admission is still per number, which is the part the client reads.
  */
  http.post(url("/me/invite-codes/redeem"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth) {
      return envelope("unauthorized", "Sign in to use an invite code.", 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }
    if (scenario === "invite-rate-limited") {
      return envelope(
        "rate_limited",
        "Too many invite codes tried. Try again later.",
        429,
      );
    }
    if (isAdmitted(request)) {
      return HttpResponse.json(
        { admitted: true, alreadyAdmitted: true },
        { headers: mockHeaders(rid()) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      code?: unknown;
    };
    const code =
      typeof body.code === "string"
        ? body.code.replace(/[\s-]/g, "").toUpperCase()
        : "";
    if (!/^[A-HJKMNP-Z2-9]{8}$/.test(code)) {
      return envelope("invalid_input", "That is not an invite code.", 400);
    }

    switch (code) {
      case MOCK_INVITE_CODES.used:
        return envelope(
          "invite_code_used",
          "Somebody has already used this code.",
          409,
        );
      case MOCK_INVITE_CODES.expired:
        return envelope("invite_code_expired", "This code has expired.", 410);
      case MOCK_INVITE_CODES.valid:
        admittedByCode.add(auth);
        return HttpResponse.json(
          { admitted: true },
          { headers: mockHeaders(rid()) },
        );
      default:
        return envelope(
          "invite_code_unknown",
          "There is no such code, or it was withdrawn.",
          404,
        );
    }
  }),

  /*
    Keeping and clearing the stay (yuvoy-api#257), by the contract's rules:
    days in the market's calendar, `to` not before `from` and at most 60 days
    after it, both between 2000 and 2100, and `destinationKey`, when sent, a
    key the catalogue knows. Each problem is one sentence in `details`, keyed
    by its field, as `setMyStay` says. Refused, never clamped: a mock that
    quietly fixed a bad range would let a screen that sends one pass.

    `?__scenario=stay-absent` is an API from before #257, where the route does
    not exist.
  */
  http.put(url("/me/stay"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth) return envelope("unauthorized", "Sign in first.", 401);
    const scenario = scenarioOf(request);
    if (scenario === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }
    if (scenario === "stay-absent") {
      return envelope("not_found", "No such route.", 404);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const problems = stayProblems(body);
    if (Object.keys(problems).length > 0) {
      return envelope(
        "invalid_input",
        "Those days could not be kept.",
        400,
        problems,
      );
    }
    const stay = {
      from: body!.from as string,
      to: body!.to as string,
      ...(typeof body!.destinationKey === "string"
        ? { destinationKey: body!.destinationKey }
        : {}),
    };
    staysByCredential.set(auth, stay);
    return HttpResponse.json(stay, { headers: mockHeaders(rid()) });
  }),

  http.delete(url("/me/stay"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth) return envelope("unauthorized", "Sign in first.", 401);
    const scenario = scenarioOf(request);
    if (scenario === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }
    if (scenario === "stay-absent") {
      return envelope("not_found", "No such route.", 404);
    }
    // "Clearing a stay that is not there is the same 204."
    staysByCredential.delete(auth);
    return new HttpResponse(null, { status: 204 });
  }),
];
