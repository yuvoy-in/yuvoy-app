import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetOutcomeCollector,
  outcomeCollector,
} from "@/lib/analytics/outcomes";
import type { FoundItem } from "@/lib/found/found-words";
import { FoundItemCard } from "./found-item-card";

/**
 * One found card (yuvoy-app#179): every field from the API in its place, the
 * copy table's line wherever a field is missing, the status words, and the
 * trust line word for word. See details and Report a problem are other
 * parts' components and are stood in for here.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("./see-details", () => ({
  SeeDetails: ({ item }: { item: { seeDetailsUrl?: string } }) =>
    item.seeDetailsUrl ? <a href={item.seeDetailsUrl}>See details</a> : null,
}));

const share = vi.hoisted(() => ({
  result: "copied" as "shared" | "dismissed" | "copied" | "unavailable",
  calls: [] as { title: string; url: string }[],
}));
vi.mock("@/lib/share", () => ({
  shareUrl: async (input: { title: string; url: string }) => {
    share.calls.push(input);
    return share.result;
  },
}));

const item = (over: Partial<FoundItem> = {}): FoundItem => ({
  id: "6f1c0e2a-0000-4000-8000-000000000001",
  kind: "event",
  department: "food_drink",
  title: "Filter coffee walk in Basavanagudi",
  when: {
    startsOn: "2026-11-22",
    startTime: "18:30",
    endsOn: null,
    repeats: null,
  },
  where: { placeText: "Vidyarthi Bhavan", town: "Bengaluru" },
  price: { kind: "paid", from: null, text: "From ₹499" },
  status: "scheduled",
  check: {
    tier: "staff_checked",
    label: "Checked by Yuvoy · 16 Oct · organiser's page",
    checkedAt: "2026-10-16T09:00:00Z",
    lapsed: false,
    sourceName: "example.in",
    sourceUrl: "https://example.in/walks/1",
  },
  seeDetailsUrl: "https://example.in/walks/1",
  ...over,
});

function renderCard(
  over: Partial<FoundItem> = {},
  props: Partial<Parameters<typeof FoundItemCard>[0]> = {},
) {
  const onReport = vi.fn();
  const view = render(
    <FoundItemCard
      item={item(over)}
      position={2}
      timezone="Asia/Kolkata"
      departmentName="Food and drink"
      onReport={onReport}
      {...props}
    />,
  );
  return { ...view, onReport, card: screen.getByRole("article") };
}

beforeEach(() => {
  share.result = "copied";
  share.calls = [];
  __resetOutcomeCollector();
});
afterEach(() => {
  setConsent("denied");
  __resetOutcomeCollector();
});

describe("a found card's fields", () => {
  it("shows each field from the API", () => {
    const { card } = renderCard();
    const c = within(card);
    expect(c.getByText("Food and drink")).toBeInTheDocument();
    expect(
      c.getByRole("heading", { name: "Filter coffee walk in Basavanagudi" }),
    ).toBeInTheDocument();
    expect(c.getByText("Sun, 22 Nov · 18:30")).toBeInTheDocument();
    expect(c.getByText("Vidyarthi Bhavan, Bengaluru")).toBeInTheDocument();
    expect(c.getByText("From ₹499")).toBeInTheDocument();
    expect(
      c.getByText("Checked by Yuvoy · 16 Oct · organiser's page"),
    ).toBeInTheDocument();
    expect(c.getByRole("link", { name: "See details" })).toHaveAttribute(
      "href",
      "https://example.in/walks/1",
    );
  });

  it("names the article by its title, and links the title to the card's page", () => {
    const { card } = renderCard();
    expect(card).toHaveAccessibleName("Filter coffee walk in Basavanagudi");
    expect(
      within(card).getByRole("link", {
        name: "Filter coffee walk in Basavanagudi",
      }),
    ).toHaveAttribute("href", "/f/6f1c0e2a-0000-4000-8000-000000000001");
  });

  it("carries its id and place for the shown observer", () => {
    const { card } = renderCard();
    expect(card).toHaveAttribute(
      "data-found-id",
      "6f1c0e2a-0000-4000-8000-000000000001",
    );
    expect(card).toHaveAttribute("data-found-position", "2");
    expect(card).toHaveAttribute("aria-posinset", "3");
  });

  it("says the trust line word for word, whatever the tier", () => {
    const label = "Found by Trigo · not checked yet";
    const { card } = renderCard({
      check: {
        tier: "found",
        label,
        checkedAt: null,
        lapsed: false,
        sourceName: "venue.example",
        sourceUrl: "https://venue.example/x",
      },
    });
    expect(within(card).getByText(label)).toBeInTheDocument();
    expect(within(card).queryByText(/Checked by Yuvoy/)).toBeNull();
  });
});

describe("what a card does not say", () => {
  it("sends an undated card to its page for the dates", () => {
    const { card } = renderCard({
      when: { startsOn: null, startTime: null, endsOn: null, repeats: null },
    });
    expect(
      within(card).getByText("Check dates on their page"),
    ).toBeInTheDocument();
  });

  it("says the repeat as the source states it", () => {
    const { card } = renderCard({
      when: {
        startsOn: "2026-11-22",
        startTime: null,
        endsOn: null,
        repeats: "Every Sunday",
      },
    });
    expect(
      within(card).getByText("Every Sunday · next Sun, 22 Nov"),
    ).toBeInTheDocument();
  });

  it("gives a span of days from start to end", () => {
    const { card } = renderCard({
      when: {
        startsOn: "2026-11-21",
        startTime: "10:00",
        endsOn: "2026-11-22",
        repeats: null,
      },
    });
    expect(
      within(card).getByText("Sat, 21 Nov · 10:00 to Sun, 22 Nov"),
    ).toBeInTheDocument();
  });

  it("sends a card with no venue to its page for the place", () => {
    const { card } = renderCard({
      where: { placeText: null, town: "Bengaluru" },
    });
    expect(within(card).getByText("Place on their page")).toBeInTheDocument();
  });

  it("does not say the town twice", () => {
    const { card } = renderCard({
      where: { placeText: "12 MG Road, Bengaluru", town: "Bengaluru" },
    });
    expect(within(card).getByText("12 MG Road, Bengaluru")).toBeInTheDocument();
  });

  it("shows the price words as sent, free and unknown alike", () => {
    renderCard({ price: { kind: "free", from: null, text: "Free" } });
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("shows the art alone when the vocabulary gives no name", () => {
    const { card } = renderCard({}, { departmentName: null });
    expect(within(card).queryByText("Food and drink")).toBeNull();
  });

  it("has no See details without a link", () => {
    const { card } = renderCard({ seeDetailsUrl: undefined });
    expect(
      within(card).queryByRole("link", { name: "See details" }),
    ).toBeNull();
  });
});

describe("the status tag", () => {
  it.each([
    ["cancelled", "Cancelled"],
    ["postponed", "Postponed"],
    ["moved", "Date or place changed"],
    ["sold_out", "Sold out"],
    ["ended", "This has ended"],
  ] as const)("says %s as %s", (status, words) => {
    const { card } = renderCard({ status });
    expect(within(card).getByText(words)).toBeInTheDocument();
  });

  it("says nothing for a scheduled card", () => {
    const { card } = renderCard({ status: "scheduled" });
    for (const words of [
      "Cancelled",
      "Postponed",
      "Date or place changed",
      "Sold out",
      "This has ended",
    ]) {
      expect(within(card).queryByText(words)).toBeNull();
    }
  });
});

describe("More", () => {
  it("opens to Share and Report a problem, and Escape closes it on its button", async () => {
    renderCard();
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Report a problem" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
  });

  it("shares the card's own page on this origin, and counts it", async () => {
    setConsent("granted");
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(share.calls).toEqual([
      {
        title: "Filter coffee walk in Basavanagudi",
        url: `${window.location.origin}/f/6f1c0e2a-0000-4000-8000-000000000001`,
      },
    ]);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(outcomeCollector().inspect().waiting).toEqual([
      expect.objectContaining({
        kind: "shared",
        subjectType: "event",
        subjectId: "6f1c0e2a-0000-4000-8000-000000000001",
        surface: "found_feed",
        position: 2,
      }),
    ]);
  });

  it("does not count a share sheet closed without sending", async () => {
    setConsent("granted");
    share.result = "dismissed";
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(outcomeCollector().inspect().waiting).toEqual([]);
  });

  it("asks the feed for Report a problem, with focus back on More", async () => {
    const { onReport } = renderCard();
    const more = screen.getByRole("button", { name: "More" });
    await userEvent.click(more);
    await userEvent.click(
      screen.getByRole("button", { name: "Report a problem" }),
    );
    expect(onReport).toHaveBeenCalledWith(
      "6f1c0e2a-0000-4000-8000-000000000001",
    );
    expect(more).toHaveFocus();
  });
});
