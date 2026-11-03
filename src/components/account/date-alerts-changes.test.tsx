import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { DateAlertsScreen } from "./date-alerts-screen";
import {
  noContent,
  refuse,
  serveAlerts,
  serveStop,
  signedIn,
} from "@/components/trigo/lists-test-kit";
import {
  WAITING_ALERT_ID,
  defaultAlerts,
} from "../../../mocks/trigo-list-fixtures";
import { ALERT_GONE, LISTS_DOWN } from "../../../mocks/trigo-list-handlers";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/account/date-alerts",
}));

afterEach(cleanup);

const show = () => renderWithQuery(<DateAlertsScreen />);
const STOP_FIRST = `${W.stopAlert}: Try dive at Nemo Reef`;
const rest = () => defaultAlerts().slice(1);

/** Stopping an alert (yuvoy-app#220). Only a 204 is done. */
describe("Date alerts: stop", () => {
  it("takes the row out on a 204, and reads the list again", async () => {
    signedIn();
    const read = serveAlerts(defaultAlerts(), rest());
    const stop = serveStop(noContent);
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: STOP_FIRST }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Try dive at Nemo Reef")).toBeNull(),
    );
    expect(stop.ids).toEqual([WAITING_ALERT_ID]);
    await waitFor(() => expect(read.count).toBe(2));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the API's sentence on a 404, and reads the list again", async () => {
    signedIn();
    const read = serveAlerts(defaultAlerts(), rest());
    serveStop(() => refuse(404, "not_found", ALERT_GONE));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: STOP_FIRST }),
    );

    expect(await screen.findByText(ALERT_GONE)).toBeInTheDocument();
    await waitFor(() => expect(read.count).toBe(2));
    expect(screen.queryByText("Try dive at Nemo Reef")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the row and says so under it when the stop fails otherwise", async () => {
    signedIn();
    serveAlerts(defaultAlerts());
    const stop = serveStop(
      () => refuse(500, "internal_error", "Something broke."),
      noContent,
    );
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: STOP_FIRST }),
    );

    const failed = await screen.findByRole("alert");
    expect(failed).toHaveTextContent(W.stopFailed);
    const row = failed.closest("li")!;
    expect(within(row).getByText("Try dive at Nemo Reef")).toBeInTheDocument();

    await userEvent.click(
      within(failed).getByRole("button", { name: W.tryAgain }),
    );
    await waitFor(() => expect(stop.count).toBe(2));
  });

  it("does not count a 200 as done", async () => {
    signedIn();
    serveAlerts(defaultAlerts());
    serveStop(() => new Response("{}", { status: 200 }));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: STOP_FIRST }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(W.stopFailed);
    expect(screen.getByText("Try dive at Nemo Reef")).toBeInTheDocument();
  });

  it("says the sign-in expired on a 401", async () => {
    signedIn();
    serveAlerts(defaultAlerts());
    serveStop(() => refuse(401, "unauthorized", "Sign in again."));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: STOP_FIRST }),
    );
    expect(
      await screen.findByRole("heading", { name: W.alertsExpired.title }),
    ).toBeInTheDocument();
  });
});

/** A list that did not load (yuvoy-app#220). */
describe("Date alerts: a list that did not load", () => {
  it("shows the error state on a 503, not the empty line, and Try again reads it again", async () => {
    signedIn();
    const read = serveAlerts(() => refuse(503, "unavailable", LISTS_DOWN), []);
    show();

    const failed = await screen.findByRole("alert");
    expect(failed).toHaveTextContent(W.alertsFailed);
    expect(failed).toHaveTextContent(LISTS_DOWN);
    expect(screen.queryByText(W.alertsEmpty)).toBeNull();

    await userEvent.click(
      within(failed).getByRole("button", { name: W.tryAgain }),
    );
    expect(await screen.findByText(W.alertsEmpty)).toBeInTheDocument();
    expect(read.count).toBe(2);
  });

  it("says the sign-in expired on a 401, with the way back in", async () => {
    signedIn();
    serveAlerts(() => refuse(401, "unauthorized", "Sign in again."));
    show();

    const expired = await screen.findByRole("alert");
    expect(
      within(expired).getByRole("heading", { name: W.alertsExpired.title }),
    ).toBeInTheDocument();
    expect(
      within(expired).getByRole("link", { name: W.alertsExpired.action }),
    ).toHaveAttribute("href", "/account?next=/account/date-alerts");
    expect(screen.queryByText(W.alertsEmpty)).toBeNull();
  });

  it("shows the general error with Try again for anything else", async () => {
    signedIn();
    serveAlerts(() => refuse(500, "internal_error", "Something broke."));
    show();

    const failed = await screen.findByRole("alert");
    expect(failed).toHaveTextContent(W.alertsFailed);
    expect(failed).toHaveTextContent("It is us, not you");
    expect(
      within(failed).getByRole("button", { name: W.tryAgain }),
    ).toBeInTheDocument();
    expect(screen.queryByText(W.alertsEmpty)).toBeNull();
  });
});
