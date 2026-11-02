import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { addressBar, followHistory, navigateTo } from "@/test/address";
import { EVENTS } from "@/lib/analytics/events";
import { captureEvent } from "@/lib/observability/report";
import { TRIGO_TITLE } from "@/lib/trigo/words";
import { AskAboutButton } from "./ask-about-button";
import { AskTrigoButton } from "./ask-trigo-button";
import { TrigoProvider, parseTrigoParam } from "./trigo-provider";
import { ASK_ABOUT } from "./ui-words";

/**
 * The ways into Trigo (yuvoy-app#223): the masthead button and "Ask Trigo
 * about this", shown only while `releases.trigo` is open, and the address
 * as the switch (`?trigo=open | {id} | about:{cardId}`).
 *
 * The sheet is a stand-in here: its states are `trigo-sheet.test.tsx`'s.
 */

const release = vi.hoisted(() => ({
  value: { open: false, pending: false, stage: "off" },
}));
vi.mock("@/lib/site/use-release", () => ({
  useRelease: () => release.value,
}));

vi.mock("@/lib/observability/report", () => ({ captureEvent: vi.fn() }));

vi.mock("./trigo-sheet", () => ({
  TrigoSheet: ({
    open,
    request,
  }: {
    open: boolean;
    request: { aboutCardId: string | null } | null;
  }) => (
    <div
      data-testid="trigo-sheet"
      data-open={String(open)}
      data-about={request?.aboutCardId ?? ""}
    />
  ),
}));

vi.mock("next/navigation", async () => {
  const { useShownAddress } = await import("@/test/address");
  return {
    usePathname: () => "/",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () =>
      new URLSearchParams(useShownAddress().split("?")[1] ?? ""),
  };
});

let unfollow: () => void;
beforeEach(() => {
  unfollow = followHistory();
  navigateTo("/e/scuba-havelock");
  release.value = { open: false, pending: false, stage: "off" };
  vi.mocked(captureEvent).mockClear();
});
afterEach(() => unfollow());

function page() {
  return renderWithQuery(
    <TrigoProvider>
      <AskTrigoButton />
      <AskAboutButton cardId="exp:scuba-havelock" entry="listing" />
    </TrigoProvider>,
  );
}

describe("Ask Trigo buttons", () => {
  it("are hidden while the release is closed", () => {
    page();
    expect(screen.queryByRole("button", { name: TRIGO_TITLE })).toBeNull();
    expect(screen.queryByRole("button", { name: ASK_ABOUT })).toBeNull();
  });

  it("are hidden outside the provider, whatever the release says", () => {
    release.value = { open: true, pending: false, stage: "all" };
    renderWithQuery(
      <>
        <AskTrigoButton />
        <AskAboutButton cardId="item:1" entry="found_card" />
      </>,
    );
    expect(screen.queryByRole("button", { name: TRIGO_TITLE })).toBeNull();
    expect(screen.queryByRole("button", { name: ASK_ABOUT })).toBeNull();
  });

  it("Ask Trigo opens the sheet with ?trigo=open, counted once", async () => {
    release.value = { open: true, pending: false, stage: "all" };
    page();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: TRIGO_TITLE }));
    expect(addressBar().get("trigo")).toBe("open");
    expect(await screen.findByTestId("trigo-sheet")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(captureEvent).toHaveBeenCalledWith(EVENTS.trigoOpened, {
      entry: "masthead",
    });
  });

  it("Ask about opens the sheet about the card", async () => {
    release.value = { open: true, pending: false, stage: "all" };
    page();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: ASK_ABOUT }));
    expect(addressBar().get("trigo")).toBe("about:exp:scuba-havelock");
    const sheet = await screen.findByTestId("trigo-sheet");
    expect(sheet).toHaveAttribute("data-about", "exp:scuba-havelock");
    expect(captureEvent).toHaveBeenCalledWith(EVENTS.trigoOpened, {
      entry: "listing",
    });
  });

  it("an address that arrives with ?trigo= opens the sheet on its own", async () => {
    navigateTo("/?trigo=about:item:5b0c3c1e");
    page();
    expect(await screen.findByTestId("trigo-sheet")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(captureEvent).toHaveBeenCalledWith(EVENTS.trigoOpened, {
      entry: "found_card",
    });
    act(() => navigateTo("/"));
    expect(screen.getByTestId("trigo-sheet")).toHaveAttribute(
      "data-open",
      "false",
    );
  });
});

describe("parseTrigoParam", () => {
  it("reads the three forms and drops what is not an id", () => {
    expect(parseTrigoParam("open")).toEqual({
      conversationId: null,
      aboutCardId: null,
    });
    expect(parseTrigoParam("about:exp:scuba")).toEqual({
      conversationId: null,
      aboutCardId: "exp:scuba",
    });
    expect(parseTrigoParam("7d1c2a3b-4e5f")).toEqual({
      conversationId: "7d1c2a3b-4e5f",
      aboutCardId: null,
    });
    expect(parseTrigoParam("<script>")).toEqual({
      conversationId: null,
      aboutCardId: null,
    });
    expect(parseTrigoParam(null)).toBeNull();
  });
});
