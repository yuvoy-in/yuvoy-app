import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { callUpstream } from "@/lib/auth/upstream";
import { civilInZone, weekdayDayMonth, clockTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The booking as an image a traveller can keep (yuvoy-app#61 item 2).
 *
 * ## Why this is a POST, and why it is a route at all
 *
 * "**Never put the token in a URL.**" A status token opens the booking and can
 * CANCEL it, and a URL is the least private thing on a phone: it is in the
 * address bar, in history, in the referrer of anything the page loads, and in
 * any screenshot of the browser. So the token arrives in a request body, which
 * is why an image that would naturally be a `GET` is a `POST`.
 *
 * It renders on the server rather than in the browser because `next/og` draws
 * a real PNG, and because the traveller's device does not hold the booking:
 * since yuvoy-app#60 the only copy is the API's, reachable with this token.
 *
 * ## What it deliberately does not carry
 *
 * No QR code ("nothing at the jetty scans it"), and no phone number or email.
 * A kept image is the most forwardable thing this product produces, and a
 * contact detail on it travels with every forward.
 */
export const dynamic = "force-dynamic";

/** The issue's size, and a phone's own aspect, so Photos keeps it whole. */
const WIDTH = 1080;
const HEIGHT = 1920;

/*
  The palette, stated once. Tokens cannot reach here: this renders outside the
  CSS pipeline, the same as `opengraph-image.tsx`, and `palette.test.ts`
  allowlists both files for exactly that reason.
*/
const FOREST = "#16362e";
const PAPER = "#ffffff";
const TERRA = "#be7149";

export async function POST(request: Request) {
  let input: { token?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Expected a JSON body." } },
      { status: 400 },
    );
  }

  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      {
        error: { code: "invalid_input", message: "A booking token is needed." },
      },
      { status: 400 },
    );
  }

  const upstream = await callUpstream({
    method: "GET",
    path: "/bookings/status",
    token,
    from: request,
  });

  /*
    A dead or unknown token is a 404, not a 401, and the two are collapsed on
    purpose. This route is reachable by anybody who can post to it, so
    distinguishing "that token expired" from "no such booking" would confirm
    that a particular token was once real.
  */
  if (upstream.status === 401 || upstream.status === 404) {
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "That booking link is not valid.",
        },
      },
      { status: 404 },
    );
  }
  if (upstream.status !== 200 || !upstream.body) {
    return NextResponse.json(
      {
        error: {
          code: "unavailable",
          message: "We could not make the image just now.",
        },
      },
      { status: 502 },
    );
  }

  const status = upstream.body as BookingStatus;

  return new ImageResponse(<Pass status={status} />, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      /*
        A booking changes: it is cancelled, the operator moves it, the cash is
        recorded. A cached pass would be a stale statement about somebody's
        trip, and it is drawn from a bearer token besides.
      */
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The pass itself.
 *
 * Satori, which `next/og` uses, supports a subset of flexbox and needs every
 * element to declare `display`. It also needs TTF or OTF for a custom face and
 * the brand ships woff2 only, so this is set in the system sans, the same
 * trade `opengraph-image.tsx` made and for the same reason.
 */
function Pass({ status }: { status: BookingStatus }) {
  /*
    The booking carries an INSTANT plus the market's zone, not the pre-formatted
    local fields a catalogue slot has, so the day has to be computed in that
    zone. Rendering it in the server's own zone would put a 7am dive on the pass
    as 1:30am, which is a missed boat printed on the thing somebody brings to
    the jetty.
  */
  const civil = status.slot?.startsAt
    ? civilInZone(status.slot.startsAt, status.slot.timezone ?? "Asia/Kolkata")
    : null;
  const when = civil ? `${weekdayDayMonth(civil)} · ${clockTime(civil)}` : null;

  const meeting = [status.meetingPoint?.text, status.meetingPoint?.landmark]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: FOREST,
        color: PAPER,
        padding: 96,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* The mark, drawn rather than fetched: a remote image is a request
            this route would have to wait on to answer at all. */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 20, height: 20, background: TERRA }} />
          <div
            style={{
              fontSize: 38,
              letterSpacing: "0.34em",
              fontWeight: 700,
            }}
          >
            YUVOY
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 96,
          }}
        >
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
            {status.experience?.title ?? "Your trip"}
          </div>
          {status.experience?.operator ? (
            <div style={{ fontSize: 36, marginTop: 20, opacity: 0.8 }}>
              {status.experience.operator}
            </div>
          ) : null}
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", marginTop: 72 }}
        >
          {when ? <Row label="When" value={when} /> : null}
          {meeting ? <Row label="Where you meet" value={meeting} /> : null}
          <Row
            label="Party"
            value={`${status.guests ?? 1} ${status.guests === 1 ? "person" : "people"}`}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 28, letterSpacing: "0.2em", opacity: 0.7 }}>
          REFERENCE
        </div>
        {/*
          The thing read out at a jetty, so it is the largest text on the pass.
          "Request" where there is none: a booking the operator has not
          answered has no reference, and an internal id in this position is a
          number somebody will read out to no effect.
        */}
        <div
          style={{
            fontSize: 92,
            fontWeight: 700,
            letterSpacing: "0.06em",
            marginTop: 12,
          }}
        >
          {status.bookingReference ?? "Request"}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            padding: "22px 32px",
            borderRadius: 24,
            background: TERRA,
            color: FOREST,
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          {statusLine(status)}
        </div>

        <div style={{ fontSize: 30, marginTop: 56, opacity: 0.7 }}>
          Show this at the meeting point
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 40 }}>
      <div style={{ fontSize: 26, letterSpacing: "0.2em", opacity: 0.6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 42, marginTop: 10 }}>{value}</div>
    </div>
  );
}

/**
 * One line, and cash wins over the state.
 *
 * A cash booking reads `confirmed` since D-034, with what is owed in
 * `payment`. Printing "Confirmed" on a pass somebody carries to a jetty where
 * they will be asked for notes is the same untruth yuvoy-app#29 fixed on the
 * booking screen, on the one artefact they are most likely to be holding.
 */
function statusLine(status: BookingStatus): string {
  const payment = status.payment;
  if (payment?.method === "cash" && payment.collected !== true) {
    const amount =
      typeof payment.amountPaise === "number"
        ? formatMoney({
            amountMinor: payment.amountPaise,
            currency: status.price?.currency ?? "INR",
          })
        : null;
    return amount
      ? `Pay ${amount} in cash on the day`
      : "Pay the operator in cash on the day";
  }
  if (status.state === "awaiting_operator" || status.state === "verifying") {
    return "Waiting for the operator";
  }
  return "Confirmed";
}
