import { http, HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import {
  byToken,
  envelope,
  idempotent,
  messageKeys,
  reservations,
  rid,
  scenarioOf,
  url,
} from "./booking-support";
import {
  admittedByCode,
  staysByCredential,
  supportRequests,
} from "./booking-account";
import {
  INVITED_CANCELLED,
  INVITED_TRIP,
  seedListedTrips,
} from "./booking-trips";

/*
  The invited-trip and guest-list handlers, moved word for word from
  booking-handlers.ts (yuvoy-app#243), with the guest list in memory.
  `__resetBookingMocks` moved here too, because it sets `guestSeq` back,
  and a module can only write its own bindings. booking-handlers.ts
  re-exports it and lists the handlers in their old place.
*/
/**
 * A trip somebody else booked and invited this number to.
 *
 * No price, no payment, no reference, and nothing about the booker. The
 * contract lists all of those as deliberately absent for a guest, so a fixture
 * that carried any of them would let a card render something a guest must
 * never see and no server would send.
 */
/**
 * The booker's guest list, in memory (yuvoy-app#38 item 6).
 *
 * Mutable on purpose. The panel invites, sees a row appear, removes it and
 * sees it go, and none of that is provable against a fixed fixture: a list
 * that never changes lets a panel that never refetches pass.
 *
 * Reset between tests by `__resetBookingMocks`, like the reservations store.
 */
type MockGuest = {
  id: string;
  phoneMasked?: string;
  name?: string;
  state: "invited" | "joined" | "declined";
  delivery: "not_sent_no_channel" | "queued" | "not_applicable";
  createdAt: string;
};
const mockGuests: MockGuest[] = [];
let guestSeq = 1;

export const inviteHandlers = [
  /* -------------------------------------------------- invited trips ---- */

  /*
    Trips somebody else booked (yuvoy-app#38). A guest's row carries no price,
    no payment, no refund and no booking reference, and this fixture carries
    none either: a mock that sent them would let a card render money a guest
    must never see, and the issue forbids it twice.
  */
  http.get(url("/me/invited-trips"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    /*
      A revoked session refuses EVERY authenticated call, which is what the real
      API does and what this scenario has to reproduce.

      Without this the mock was incoherent, and an e2e test found it: bookings
      answered 401 and cleared the cookie, then this call answered 200 and the
      proxy re-set the cookie from the token that request had carried. The proxy
      is right to do that (a 200 means the API accepted the token), so the
      mock was the thing that was wrong.
    */
    if (scenarioOf(request) === "session-expired") {
      return envelope("token_expired", "That session has ended.", 401);
    }
    return HttpResponse.json(
      { trips: [INVITED_TRIP, INVITED_CANCELLED] },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/me/invited-trips/:id"), async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    if (params.id === INVITED_CANCELLED.id) {
      return HttpResponse.json(INVITED_CANCELLED);
    }
    if (params.id !== INVITED_TRIP.id) {
      return envelope("not_found", "No such invitation.", 404);
    }
    return HttpResponse.json(INVITED_TRIP, { headers: mockHeaders(rid()) });
  }),

  http.post(url("/me/invited-trips/:id/accept"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    return HttpResponse.json({ ...INVITED_TRIP, guestState: "joined" });
  }),

  http.post(url("/me/invited-trips/:id/decline"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  /*
    The invite LINK's preview. No credential at all, deliberately: the landing
    page shows the trip to a signed-out visitor and then asks them to sign in,
    which is the whole shape of the flow.
  */
  http.get(url("/invites/:token"), async ({ params }) => {
    if (params.token === "gone") {
      return envelope("not_found", "No such invitation.", 404);
    }
    return HttpResponse.json({
      experience: INVITED_TRIP.experience,
      experienceSlug: INVITED_TRIP.experienceSlug,
      operator: INVITED_TRIP.operator,
      localDate: INVITED_TRIP.localDate,
      localTime: INVITED_TRIP.localTime,
      status: INVITED_TRIP.status,
    });
  }),

  http.post(url("/invites/:token/accept"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "Sign in first.", 401);
    }
    return HttpResponse.json({ id: INVITED_TRIP.id });
  }),

  /* --------------------------------------------- the booker's guests ---- */

  /*
    Inviting people onto a booking (yuvoy-app#38 items 6 and 12).

    In-memory, so the panel can be walked end to end: invite, see the row
    appear, remove it, see it go. A mock that answered a fixed list would let
    the panel pass every test while never actually refetching.

    `maxGuests` is the party size less the booker, which is the rule the client
    is forbidden from deriving. `delivery: not_sent_no_channel` is what the API
    answers today, because there is no WhatsApp sender yet, and it is the case
    where the BOOKER has to deliver the link.
  */
  http.post(url("/bookings/invites"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "party-full") {
      return envelope("conflict", "Every place is already offered.", 409);
    }

    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
    };
    const id = `tgi_${guestSeq++}`;
    mockGuests.push({
      id,
      ...(body.phone ? { phoneMasked: `••• ${body.phone.slice(-4)}` } : {}),
      state: "invited" as const,
      delivery: "not_sent_no_channel" as const,
      createdAt: new Date(mockNow()).toISOString(),
    });
    return HttpResponse.json(
      {
        id,
        state: "invited",
        delivery: "not_sent_no_channel",
        inviteUrl: `https://app.yuvoy.in/i/${id}`,
      },
      { status: 201, headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/bookings/invites"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    return HttpResponse.json(
      {
        guests: mockGuests,
        // A party of three: the booker plus two places to offer.
        maxGuests: scenarioOf(request) === "party-of-one" ? 0 : 2,
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/bookings/invites/:id"), async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", "That link is not valid.", 401);
    }
    const at = mockGuests.findIndex((g) => g.id === params.id);
    if (at >= 0) mockGuests.splice(at, 1);
    // 204 "also when they were already removed".
    return new HttpResponse(null, { status: 204 });
  }),
];

/** Test-only: forget every reservation between cases. */
export function __resetBookingMocks(): void {
  reservations.clear();
  byToken.clear();
  // The listed trips are fixtures, not a test's leftovers: they come back.
  seedListedTrips();
  idempotent.clear();
  messageKeys.clear();
  // The guest list too, or one test's invitation is the next one's fixture.
  mockGuests.length = 0;
  guestSeq = 1;
  // And the help requests one test sent.
  supportRequests.length = 0;
  // And the numbers one test let in with a code.
  admittedByCode.clear();
  // And the days one test kept on an account.
  staysByCredential.clear();
}
