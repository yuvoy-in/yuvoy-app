import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { HelpCenter } from "./help-center";
import { server } from "../../../mocks/server";
import { __resetAppRouteMocks } from "../../../mocks/app-route-handlers";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/help",
}));

/**
 * The Help Center, which exists so the product can answer a question without
 * making somebody message a person and wait for it.
 */
afterEach(() => {
  cleanup();
  __resetAppRouteMocks();
});

describe("reading", () => {
  it("shows the categories without anything being asked of it", async () => {
    renderWithQuery(<HelpCenter />);

    expect(
      await screen.findByRole("heading", { name: "Booking" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Changes and cancelling" }),
    ).toBeInTheDocument();
  });

  it("keeps an answer readable while it is shut", () => {
    /*
      `<details>` rather than a state hook, and this is the reason worth
      pinning: the text is in the DOM while collapsed, so the browser's own
      in-page search finds it. A traveller pressing Cmd+F for "cash" on a help
      page that renders nothing until clicked finds nothing.
    */
    renderWithQuery(<HelpCenter />);
    expect(screen.getByText(/bring cash/i)).toBeInTheDocument();
  });

  it("works with no session, because a signed-out traveller still needs help", async () => {
    server.use(
      http.get("/api/v1/me", () => HttpResponse.json(null, { status: 401 })),
    );

    renderWithQuery(<HelpCenter />);

    // Every answer is static. A failed /me costs the WhatsApp button, nothing
    // else, and must not take the page down with it.
    expect(
      await screen.findByRole("heading", { name: "Booking" }),
    ).toBeInTheDocument();
  });
});

describe("search", () => {
  it("narrows to what matches and says how many", async () => {
    const user = userEvent.setup();
    renderWithQuery(<HelpCenter />);

    await user.type(screen.getByRole("searchbox"), "cancel");

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ answers?/);
    });
    // The category headings are gone: searching replaces the index rather
    // than filtering inside it, so there is one list to read.
    expect(
      screen.queryByRole("heading", { name: "Changes and cancelling" }),
    ).toBeNull();
  });

  it("offers a person when nothing matches, rather than a dead end", async () => {
    const user = userEvent.setup();
    renderWithQuery(<HelpCenter />);

    await user.type(screen.getByRole("searchbox"), "zzzznotathing");

    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send us a message" }),
    ).toBeInTheDocument();
  });
});

describe("reaching a person", () => {
  it("says where the reply comes from, before anybody writes", async () => {
    /*
      The honest half. There is no ticket list because there is no endpoint
      behind one, so somebody handed a reference must be told where to look
      instead of being left hunting for a status screen. yuvoy-api#196.
    */
    renderWithQuery(<HelpCenter />);

    expect(await screen.findByText(/replies on WhatsApp/i)).toBeInTheDocument();
  });

  it("hides Chat with us when there is no support number", async () => {
    server.use(
      http.get("/api/v1/me", () =>
        HttpResponse.json({
          phone: "+919000003210",
          onboardingRequired: false,
          interests: [],
          trips: { total: 0, upcoming: 0, completed: 0 },
          support: { whatsappE164: null },
        }),
      ),
    );

    renderWithQuery(<HelpCenter />);

    // A Chat with us that opens nothing is worse than no chat at all, and this
    // product has shipped an unconfigured number before.
    await screen.findByRole("heading", { name: "Booking" });
    expect(screen.queryByRole("link", { name: "Chat with us" })).toBeNull();
    // The form is still there: there is always a way to reach somebody.
    expect(
      screen.getByRole("button", { name: "Send us a message" }),
    ).toBeInTheDocument();
  });
});
