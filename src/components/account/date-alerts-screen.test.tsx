import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { DateAlertsScreen } from "./date-alerts-screen";
import {
  countEveryList,
  release,
  serveAlerts,
  signedIn,
} from "@/components/trigo/lists-test-kit";
import {
  GONE_ALERT_ID,
  defaultAlerts,
  manyAlerts,
} from "../../../mocks/trigo-list-fixtures";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/account/date-alerts",
}));

afterEach(cleanup);

const show = () => renderWithQuery(<DateAlertsScreen />);
const heading = (name: string) =>
  screen.findByRole("heading", { level: 1, name });
const rows = async () => {
  const list = await screen.findByRole("list");
  return within(list).getAllByRole("listitem");
};

/** Who reaches the date alerts (yuvoy-app#220). */
describe("Date alerts: who gets in", () => {
  it("asks a signed-out traveller to sign in and come back, and reads nothing", async () => {
    release("all");
    const asked = countEveryList();
    show();
    await heading(W.signedOut.title);
    expect(
      screen.getByRole("link", { name: W.signedOut.action }),
    ).toHaveAttribute("href", "/account?next=/account/date-alerts");
    expect(asked.map((a) => a.count)).toEqual([0, 0, 0, 0]);
  });

  it("says Trigo is not open while the release is closed, and reads nothing", async () => {
    signedIn("off");
    const asked = countEveryList();
    show();
    expect(await screen.findByText(W.notOpen)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Stop telling me/ }),
    ).toBeNull();
    expect(asked.map((a) => a.count)).toEqual([0, 0, 0, 0]);
  });
});

/** What the list shows (cases from yuvoy-mobile#390). */
describe("Date alerts: the list", () => {
  it("shows the empty line with no alerts", async () => {
    signedIn();
    serveAlerts([]);
    show();
    await heading(W.alertsTitle);
    expect(await screen.findByText(W.alertsEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("offers the stop button on a waiting alert only, and says a fired one has a date", async () => {
    signedIn();
    serveAlerts(defaultAlerts().slice(0, 2));
    show();
    const [waiting, fired] = await rows();

    expect(
      within(waiting).getByRole("button", {
        name: `${W.stopAlert}: Try dive at Nemo Reef`,
      }),
    ).toBeInTheDocument();
    expect(within(waiting).queryByText(W.fired)).toBeNull();
    expect(within(waiting).getByRole("link")).toHaveAttribute(
      "href",
      "/e/try-dive-nemo-reef",
    );

    expect(within(fired).queryByRole("button")).toBeNull();
    expect(within(fired).getByText(W.fired)).toBeInTheDocument();
    expect(within(fired).getByText("Andaman Sheekha")).toBeInTheDocument();
  });

  it("shows all 100 rows of 50 waiting and 50 fired, in order", async () => {
    signedIn();
    serveAlerts(manyAlerts());
    show();
    const all = await rows();
    expect(all).toHaveLength(100);
    expect(all[0]).toHaveTextContent(/^A very long listing title/);
    all.slice(1).forEach((row, i) => {
      expect(row).toHaveTextContent(`Alert ${i + 2}`);
    });
    all.forEach((row, i) => {
      const stop = within(row).queryByRole("button");
      if (i < 50) expect(stop).not.toBeNull();
      else {
        expect(stop).toBeNull();
        expect(within(row).getByText(W.fired)).toBeInTheDocument();
      }
    });
  });

  it("says an unavailable card is no longer listed, with no link", async () => {
    signedIn();
    serveAlerts(defaultAlerts().filter((a) => a.id === GONE_ALERT_ID));
    show();
    const [gone] = await rows();
    expect(within(gone).getByText("Sunset sail from Neil")).toBeInTheDocument();
    expect(within(gone).getByText(W.noLonger)).toBeInTheDocument();
    expect(within(gone).queryByRole("link")).toBeNull();
    // Still waiting, so it can still be stopped.
    expect(
      within(gone).getByRole("button", {
        name: `${W.stopAlert}: Sunset sail from Neil`,
      }),
    ).toBeInTheDocument();
  });
});
