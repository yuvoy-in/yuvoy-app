import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { KeepBooking } from "./keep-booking";
import { server } from "../../../mocks/server";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Keep your booking (yuvoy-app#61).
 *
 * Two properties carry most of the weight, and both are negative. "Save to
 * Photos" must not appear where it cannot do what it says, and Share must
 * never send the booking page: its token can CANCEL the booking.
 */

const status = (over: Partial<BookingStatus> = {}): BookingStatus =>
  ({
    reservationId: "res_1",
    bookingReference: "YV-4K2M9P7Q",
    state: "confirmed",
    final: true,
    guests: 2,
    experience: {
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      operator: "Sample Dive Operator",
    },
    slot: { startsAt: "2026-09-20T01:30:00Z", timezone: "Asia/Kolkata" },
    price: { totalPaise: 900000, currency: "INR" },
    ...over,
  }) as BookingStatus;

/**
 * Replaces only what the component reads, never the whole `navigator`.
 *
 * A spread copy loses what lives on the prototype and hangs `userEvent.setup`,
 * and user-event installs its own clipboard stub on setup, so this has to be
 * called after it. Both cost a debugging pass on `link-actions.test.tsx`.
 */
function patchNavigator(props: {
  canShareFiles?: boolean;
  share?: (data: unknown) => Promise<void>;
  writeText?: () => Promise<void>;
}) {
  Object.defineProperty(navigator, "canShare", {
    value: props.canShareFiles ? () => true : undefined,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: props.share,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: props.writeText ?? vi.fn(async () => {}) },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  sessionStorage.clear();
  /*
    jsdom has no `createObjectURL`. Download builds one for the blob, so
    without a stand-in the button throws and the test reads as a failure of
    the component rather than of the environment.
  */
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(cleanup);

describe("Save to Photos", () => {
  it("is offered only where the browser can actually share a file", async () => {
    /*
      There is no "write to the camera roll" API on the web. What exists, on
      iOS, is a share sheet carrying "Save Image". A button labelled Save to
      Photos that quietly downloaded instead would be a lie about where the
      file went, so it is absent rather than degraded.
    */
    patchNavigator({ canShareFiles: false });
    renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Download" })).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: "Save to Photos" })).toBeNull();
  });

  it("appears where files can be shared, and hands over the PNG", async () => {
    const shared: unknown[] = [];
    const user = userEvent.setup();
    patchNavigator({
      canShareFiles: true,
      share: async (data) => void shared.push(data),
    });

    let body: unknown = null;
    server.use(
      http.post("/api/booking-pass", async ({ request }) => {
        body = await request.json();
        return HttpResponse.arrayBuffer(new ArrayBuffer(8), {
          headers: { "Content-Type": "image/png" },
        });
      }),
    );

    renderWithQuery(
      <KeepBooking status={status()} token="tok_secret" variant="panel" />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Save to Photos" }),
    );

    await waitFor(() => expect(shared).toHaveLength(1));
    // The token travelled in the BODY. A URL is in history, in a referrer and
    // in any screenshot of the browser.
    expect(body).toEqual({ token: "tok_secret" });
  });

  it("treats a cancelled share sheet as a decision, not a failure", async () => {
    const user = userEvent.setup();
    patchNavigator({
      canShareFiles: true,
      share: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    });
    server.use(
      http.post("/api/booking-pass", () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), {
          headers: { "Content-Type": "image/png" },
        }),
      ),
    );

    renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Save to Photos" }),
    );

    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("when the image cannot be made", () => {
  it("says so rather than failing silently", async () => {
    const user = userEvent.setup();
    patchNavigator({ canShareFiles: false });
    server.use(
      http.post("/api/booking-pass", () =>
        HttpResponse.json({ error: { code: "not_found" } }, { status: 404 }),
      ),
    );

    renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );
    await user.click(await screen.findByRole("button", { name: "Download" }));

    expect(
      await screen.findByText("We could not make the image. Try again."),
    ).toBeInTheDocument();
  });
});

describe("Share", () => {
  it("sends the /trip/ link, never the booking page", async () => {
    /*
      THE ONE THAT MATTERS MOST. The status token opens the booking and can
      CANCEL it; pasting it into a hostel WhatsApp group of six strangers would
      hand all six a cancel button. `POST /bookings/share` mints a separate
      read-only token for exactly this.
    */
    const shared: { url?: string }[] = [];
    const user = userEvent.setup();
    patchNavigator({
      canShareFiles: false,
      share: async (data) => void shared.push(data as { url?: string }),
    });
    server.use(
      http.post(`${BASE}/bookings/share`, () =>
        HttpResponse.json({
          shareUrl: "https://app.yuvoy.in/trip/share_tok",
          reveals: "",
        }),
      ),
    );

    renderWithQuery(
      <KeepBooking status={status()} token="tok_secret" variant="panel" />,
    );
    await user.click(await screen.findByRole("button", { name: /Share/ }));

    await waitFor(() => expect(shared).toHaveLength(1));
    expect(shared[0].url).toBe("https://app.yuvoy.in/trip/share_tok");
    expect(shared[0].url).not.toContain("tok_secret");
  });

  it("copies where there is no share sheet, and says so for two seconds", async () => {
    const writeText = vi.fn(async () => {});
    const user = userEvent.setup();
    patchNavigator({ canShareFiles: false, share: undefined, writeText });
    server.use(
      http.post(`${BASE}/bookings/share`, () =>
        HttpResponse.json({
          shareUrl: "https://app.yuvoy.in/trip/share_tok",
          reveals: "",
        }),
      ),
    );

    renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );
    await user.click(await screen.findByRole("button", { name: /Share/ }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://app.yuvoy.in/trip/share_tok",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });
});

describe("Skip", () => {
  it("closes the panel for this booking, and it stays closed on reload", async () => {
    const user = userEvent.setup();
    patchNavigator({ canShareFiles: false });

    const { unmount } = renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );
    await user.click(await screen.findByRole("button", { name: "Skip" }));
    expect(screen.queryByText("Keep your booking")).toBeNull();

    // The key the issue names, and the reload it survives inside this tab.
    expect(sessionStorage.getItem("yuvoy.keep-dismissed.YV-4K2M9P7Q")).toBe(
      "1",
    );

    unmount();
    renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByText("Keep your booking")).toBeNull();
  });

  it("does not close the always-available row", async () => {
    /*
      "keep a Save or share this booking row ... after Skip too." Skipping the
      prompt is not the same as never wanting the booking again.
    */
    const user = userEvent.setup();
    patchNavigator({ canShareFiles: false });

    renderWithQuery(
      <>
        <KeepBooking status={status()} token="tok" variant="panel" />
        <KeepBooking status={status()} token="tok" variant="row" />
      </>,
    );
    await user.click(await screen.findByRole("button", { name: "Skip" }));

    expect(screen.getByText("Save or share this booking")).toBeInTheDocument();
  });

  it("keeps one booking's dismissal to itself", async () => {
    const user = userEvent.setup();
    patchNavigator({ canShareFiles: false });

    const { unmount } = renderWithQuery(
      <KeepBooking status={status()} token="tok" variant="panel" />,
    );
    await user.click(await screen.findByRole("button", { name: "Skip" }));
    unmount();

    renderWithQuery(
      <KeepBooking
        status={status({ bookingReference: "YV-ANOTHER1" })}
        token="tok"
        variant="panel"
      />,
    );
    expect(await screen.findByText("Keep your booking")).toBeInTheDocument();
  });
});

describe("a trip that is not happening", () => {
  it("offers nothing at all", async () => {
    // There is nothing worth keeping about a cancelled trip, and an image of
    // one would outlive the page that says it is off.
    for (const state of ["cancelled", "declined", "expired"] as const) {
      cleanup();
      patchNavigator({ canShareFiles: false });
      const { container } = renderWithQuery(
        <KeepBooking status={status({ state })} token="tok" variant="row" />,
      );
      expect(container.textContent, state).toBe("");
    }
  });
});
