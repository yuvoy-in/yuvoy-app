import { HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import { exploreStageOf } from "./found-handlers";
import { creatorStaffCohort, creatorToolsOnFor } from "./creator-link-handlers";
import {
  peopleAccountFor,
  peopleStaffCohort,
  peopleSummaryFor,
} from "./people-state";
import { trigoStaffCohort } from "./trigo-handlers";
import { organiserAgeConfirmed } from "./organiser-handlers";
import { meStaffCohort } from "./me-handlers";
import { clubStaffCohort } from "./club-handlers";
import { envelope, rid, scenarioOf } from "./booking-support";

/*
  The account side of the booking mocks, moved word for word from
  booking-handlers.ts (yuvoy-app#243): the `GET /me` answer, the sign-in
  and invite codes, admission, the stays kept on an account, and the help
  requests in memory.
*/
/** `GET /me`, which `PATCH /me` under a People scenario answers too. */
export function answerMe(request: Request): Response {
  if (!request.headers.get("authorization")) {
    return envelope("unauthorized", "Sign in first.", 401);
  }
  if (scenarioOf(request) === "session-expired") {
    return envelope("token_expired", "That session has ended.", 401);
  }

  const fresh = scenarioOf(request) === "first-sign-in";
  /*
    Signed in through the email door with no number proved
    (`?__scenario=email-door`, yuvoy-api#304): `phone` is null and the
    proven email is the way in.
  */
  const emailDoor = scenarioOf(request) === "email-door";
  /*
    People (yuvoy-app#222): under its scenarios the name and the age answer
    are the session's, so the name and age steps change what this says, and
    `people` (the Account row's summary) is here while the release is open.
  */
  const auth = request.headers.get("authorization")!;
  const peopleAccount = peopleAccountFor(auth, scenarioOf(request));
  const peopleSummary = peopleSummaryFor(auth, scenarioOf(request));
  return HttpResponse.json(
    {
      phone: emailDoor ? null : "+919000000000",
      name: peopleAccount ? peopleAccount.name : fresh ? null : "Asha Menon",
      email: fresh ? null : "asha@example.com",
      emailProven: emailDoor,
      provenEmail: emailDoor ? "asha@example.com" : null,
      /*
        Who sees releases early (R0-T2): nobody, unless
        `?__scenario=cohort-staff` or `cohort-early` says so, or one of
        yuvoy-app#179's scenarios opens `explore` at `staff`, which is a
        staff tester's world, or one of yuvoy-app#207's opens `creator`
        there (all but `creator-outside`), or one of yuvoy-app#222's opens
        `people` there (all but `people-outside` and `people-all`), or one of
        yuvoy-app#223's opens `trigo` there (all but `trigo-not-released`), or
        one of yuvoy-mobile#444's opens `me` there, or one of
        yuvoy-mobile#386's opens `people` there (all but `clubs-all` and
        `clubs-outside`).
      */
      cohort:
        scenarioOf(request) === "cohort-staff" ||
        exploreStageOf(scenarioOf(request)) === "staff" ||
        creatorStaffCohort(scenarioOf(request)) ||
        peopleStaffCohort(scenarioOf(request)) ||
        trigoStaffCohort(scenarioOf(request)) ||
        meStaffCohort(scenarioOf(request)) ||
        clubStaffCohort(scenarioOf(request))
          ? "staff"
          : scenarioOf(request) === "cohort-early"
            ? "early"
            : null,
      interests: fresh ? [] : ["adventure", "scuba-diving"],
      /*
        The tools for a traveller's own videos and links (R12-T1): false
        until they turn them on, true under yuvoy-app#207's scenarios but
        `creator-tools-off`.
      */
      creatorToolsOn: creatorToolsOnFor(scenarioOf(request)),
      /*
        The 18+ answer: true, except under `organisers-age` until
        `PUT /me/age` is answered (yuvoy-app#224), and the People session's
        own answer under a People scenario (yuvoy-app#222).
      */
      ageConfirmed: organiserAgeConfirmed(request),
      ...(peopleAccount ? { ageConfirmed: peopleAccount.ageConfirmed } : {}),
      ...(peopleSummary ? { people: peopleSummary } : {}),
      onboardingRequired: fresh,
      memberSince: fresh ? null : "2026-07-02T04:30:00Z",
      trips: { total: 3, upcoming: 1, completed: 2 },
      reviews: { count: 1 },
      support: {
        whatsappE164: "+919000000001",
        hours: "9am to 7pm, every day",
      },
      /*
        Booking by invitation (yuvoy-api#195). Production has sent this
        since 6caa728, so the mock does too: a screen that never sees the
        field is green against data production never sends.

        True by default, because this number held a booking before
        invitations began and the migration admitted every such number.
        `?__scenario=not-admitted` (and the two scenarios below that need
        a number that is not in) says false until a code is redeemed, and
        `?__scenario=admitted-absent` leaves the field out, as an API from
        before #195 would.
      */
      ...(scenarioOf(request) === "admitted-absent"
        ? {}
        : { admitted: isAdmitted(request) }),
      /*
        The days on the island (yuvoy-api#257): "Always present on this
        API", null when none is kept, so the mock always sends the key.
        `?__scenario=stay-absent` leaves it out, as an API from before #257
        would, which is the one way the app keeps the days on the phone.
      */
      ...(scenarioOf(request) === "stay-absent"
        ? {}
        : {
            stay:
              staysByCredential.get(request.headers.get("authorization")!) ??
              null,
          }),
      /*
        Present only under a traveller session. The mock cannot tell a
        session token from a status token by inspection, so it keys on the
        prefix the verify handler mints.
      */
      ...(request.headers.get("authorization")?.includes("Bearer sess_")
        ? {
            session: {
              expiresAt: new Date(
                mockNow() + 14 * 24 * 60 * 60_000,
              ).toISOString(),
            },
          }
        : {}),
    },
    { headers: mockHeaders(rid()) },
  );
}

/**
 * The code every demo number accepts.
 *
 * "There is no channel that delivers a traveller code yet (yuvoy-api#68);
 * until there is, only the demo numbers receive one." The real API returns it
 * as `devCode` in development, which is exactly what this mock does.
 */
export const DEV_SIGN_IN_CODE = "123456";

/**
 * The invite codes the mock knows (yuvoy-api#195), normalised: no hyphen,
 * capitals. Each is eight characters of the real alphabet, which has no
 * 0, O, 1, I or L, so every one passes the client's own check and reaches
 * the handler.
 */
export const MOCK_INVITE_CODES = {
  valid: "K7QM4XRD",
  used: "USED2345",
  expired: "PAST6789",
} as const;

/**
 * Numbers admitted by a code redeemed here, keyed by the credential that
 * redeemed it (a session names its number). Module state, reset between tests
 * by `__resetBookingMocks` like everything else in this file.
 */
export const admittedByCode = new Set<string>();

/**
 * The stay each number keeps on its account (yuvoy-api#257), keyed by the
 * credential that set it, as admission is. Reset by `__resetBookingMocks`.
 */
export const staysByCredential = new Map<
  string,
  { from: string; to: string; destinationKey?: string }
>();

/** The destination keys the mock catalogue's vocabulary names. */
const KNOWN_DESTINATIONS = new Set([
  "andaman/havelock",
  "andaman/neil",
  "andaman/port_blair",
]);

/** `setMyStay`'s refusals, one sentence per field, or none. */
export function stayProblems(
  body: Record<string, unknown> | null,
): Record<string, string> {
  const problems: Record<string, string> = {};
  const day = (value: unknown): number | null => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    const [y, m, d] = value.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d);
    const back = new Date(ms);
    // 2026-02-30 is not a day, whatever the pattern says.
    if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
    return y >= 2000 && y <= 2100 ? ms : null;
  };
  const from = day(body?.from);
  const to = day(body?.to);
  if (from === null) problems.from = "Give the day you arrive, as a date.";
  if (to === null) problems.to = "Give the day you leave, as a date.";
  if (from !== null && to !== null) {
    if (to < from)
      problems.to = "The day you leave is before the day you arrive.";
    else if (to - from > 60 * 86_400_000) {
      problems.to = "A stay is at most 60 days.";
    }
  }
  const destination = body?.destinationKey;
  if (
    destination !== undefined &&
    (typeof destination !== "string" || !KNOWN_DESTINATIONS.has(destination))
  ) {
    problems.destinationKey = "That is not a destination we know.";
  }
  return problems;
}

/** The scenarios whose number is NOT admitted until it redeems a code. */
const NOT_ADMITTED_SCENARIOS = new Set([
  "not-admitted",
  "invite-required",
  "invite-rate-limited",
]);

/**
 * Whether the number behind this request may book.
 *
 * Yes, unless a scenario says it is one of the numbers invitations left out,
 * in which case only a code redeemed through this mock lets it in. A guest
 * sends no credential and is never admitted.
 */
export function isAdmitted(request: Request): boolean {
  if (!NOT_ADMITTED_SCENARIOS.has(scenarioOf(request))) return true;
  const auth = request.headers.get("authorization");
  return auth !== null && admittedByCode.has(auth);
}

/**
 * Help requests, in memory (yuvoy-api#196). Newest first, as the list is.
 *
 * `viaToken` is the mock's own bookkeeping, never sent: it is how a request
 * sent from a booking link is found again by that link.
 */
export type SupportTopic = "booking" | "payment" | "cancellation" | "other";
export type MockSupportRequest = {
  reference: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  topic: SupportTopic;
  createdAt: string;
  updatedAt: string;
  message: string;
  bookingReference?: string;
  viaToken?: string;
};
export const supportRequests: MockSupportRequest[] = [];

/**
 * Two older requests on the number, so the Help Center's list has a history
 * to draw in development: one somebody is on, and one dealt with.
 */
export const SEEDED_SUPPORT_REQUESTS: readonly MockSupportRequest[] = [
  {
    reference: "SR-1B2C3D4E",
    status: "in_progress",
    topic: "payment",
    createdAt: "2026-08-17T09:12:00Z",
    updatedAt: "2026-08-18T04:30:00Z",
    message:
      "I paid for the snorkel trip but the booking page still says it is checking the payment.",
    bookingReference: "YV-OTHERPH",
  },
  {
    reference: "SR-0A9B8C7D",
    status: "resolved",
    topic: "other",
    createdAt: "2026-08-02T11:40:00Z",
    updatedAt: "2026-08-02T15:05:00Z",
    message: "How early should we reach the jetty for a 7am dive?",
  },
];

/** A request as the API sends it: the mock's own fields left out. */
export function publicSupportRequest(request: MockSupportRequest) {
  return {
    reference: request.reference,
    status: request.status,
    topic: request.topic,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    message: request.message,
    ...(request.bookingReference
      ? { bookingReference: request.bookingReference }
      : {}),
  };
}
