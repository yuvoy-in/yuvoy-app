import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { CheckoutForm } from "./checkout-form";
import { EXPERIENCE_DETAIL, availabilityFor } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * A device store that can be told to refuse, or to never answer.
 *
 * jsdom has no IndexedDB, so the store is a no-op in every other test. Here
 * `indexedDB` is stubbed present so the store is USED, and `idb-keyval` is the
 * thing that fails — which is what Safari's private mode does: the database
 * exists and will not open.
 */
const idb = vi.hoisted(() => ({
  mode: "ok" as "ok" | "reject" | "hang",
  sets: 0,
  store: new Map<string, unknown>(),
}));
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.store.get(k),
  set: async (k: string, v: unknown) => {
    idb.sets += 1;
    if (idb.mode === "reject") throw new Error("QuotaExceededError");
    if (idb.mode === "hang") return new Promise<void>(() => {});
    idb.store.set(k, v);
  },
  del: async (k: string) => {
    idb.store.delete(k);
  },
  keys: async () => [...idb.store.keys()],
}));

const kayak = EXPERIENCE_DETAIL["mangrove-kayak-at-dawn"];
const kayakSlot = availabilityFor("mangrove-kayak-at-dawn")[0];

// Stubbed once for the file, and never unstubbed: `vi.unstubAllGlobals()`
// would also remove the setup file's IntersectionObserver, which next/link
// needs the moment a recovery link renders.
beforeAll(() => vi.stubGlobal("indexedDB", {}));
beforeEach(() => {
  replace.mockClear();
  idb.mode = "ok";
  idb.sets = 0;
  idb.store.clear();
});

async function book(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Asha Menon");
  await user.type(screen.getByLabelText("WhatsApp number"), "+919000000000");
  await user.click(screen.getByRole("checkbox", { name: /called off/i }));
  await user.click(screen.getByRole("button", { name: /hold these seats/i }));
}

describe("CheckoutForm — the device store is a convenience, never a gate", () => {
  it("still opens the booking when the device refuses to store the token", async () => {
    idb.mode = "reject";
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await book(user);

    // The reservation exists and the fragment URL carries the token: the
    // traveller goes to their booking whatever the store thought of it.
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace.mock.calls[0][0]).toMatch(/^\/booking#t=/);
    await waitFor(() => expect(idb.sets).toBeGreaterThan(0));
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("still opens the booking when the device store never answers", async () => {
    idb.mode = "hang";
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await book(user);

    // Used to be "Holding your seats…" forever.
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });

  it("keeps the token on the device when it can", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await book(user);

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        [...idb.store.keys()].some((k) => k.startsWith("yuvoy.token.")),
      ).toBe(true),
    );
  });

  it("says where to go when the server returns a reservation with no token", async () => {
    server.use(
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(
          { reservationId: "res_no_token", state: "active", guests: 1 },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await book(user);

    expect(
      await screen.findByText(
        /Your seats are held, and we could not open the page/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get my link" })).toHaveAttribute(
      "href",
      "/trips/recover",
    );
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("CheckoutForm — attribution", () => {
  it("sends the visit's claim inside the reservation body", async () => {
    sessionStorage.setItem(
      "yuvoy.attribution",
      JSON.stringify({ source: "qr", scanCode: "JETTY-2" }),
    );
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            reservationId: "res_attr",
            state: "active",
            guests: 1,
            statusToken: "tok_attr",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await book(user);

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.attribution).toEqual({ source: "qr", scanCode: "JETTY-2" });
  });

  it("sends nothing when the visit made no claim", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            reservationId: "res_plain",
            state: "active",
            guests: 1,
            statusToken: "tok_plain",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await book(user);

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!).not.toHaveProperty("attribution");
  });
});
