import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { useRelease } from "@/lib/site/use-release";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { MeSettings } from "./me-settings";
import { meRoutes, openMe, releases, settings } from "./me-test-kit";

/**
 * Me's two settings on Account (yuvoy-mobile#444 case 19): the languages
 * sent exactly as tapped, and the women-only switch only while `tables` is
 * open.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  __signInAppRouteMock();
});

const languages = () => screen.findByRole("group", { name: "Languages I'm happy with" });

function TablesProbe() {
  const release = useRelease("tables");
  return <p data-testid="tables">{release.pending ? "pending" : release.stage}</p>;
}

describe("languages", () => {
  it("shows the account's choice, with the note", async () => {
    openMe();
    meRoutes({ settings: settings({ languages: ["en", "te"] }) });
    renderWithQuery(<MeSettings />);
    const chips = await languages();
    expect(within(chips).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getByRole("button", { name: "Telugu" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getByRole("button", { name: "Hindi" })).toHaveAttribute("aria-pressed", "false");
    expect(chips).toHaveAccessibleDescription(
      "Trigo understands these. It replies in English, or in your language when you write in its own script.",
    );
  });

  it("sends Hindi with English, and reads it back after a reload", async () => {
    const user = userEvent.setup();
    openMe();
    const at = meRoutes({ settings: settings({ languages: ["en"] }) });
    const first = renderWithQuery(<MeSettings />);
    await user.click(within(await languages()).getByRole("button", { name: "Hindi" }));
    await waitFor(() => expect(at.patchSettings.bodies).toEqual([{ languages: ["en", "hi"] }]));
    first.unmount();
    renderWithQuery(<MeSettings />);
    const chips = await languages();
    await waitFor(() =>
      expect(within(chips).getByRole("button", { name: "Hindi" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(within(chips).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends exactly the chips tapped, in the chips' order, and nothing else", async () => {
    const user = userEvent.setup();
    openMe();
    const at = meRoutes({ settings: settings({ languages: ["te"] }) });
    renderWithQuery(<MeSettings />);
    const chips = await languages();
    await user.click(within(chips).getByRole("button", { name: "English" }));
    await waitFor(() => expect(at.patchSettings.bodies).toEqual([{ languages: ["en", "te"] }]));
    await user.click(within(chips).getByRole("button", { name: "Telugu" }));
    await waitFor(() =>
      expect(at.patchSettings.bodies).toEqual([
        { languages: ["en", "te"] },
        { languages: ["en"] },
      ]),
    );
    expect(within(chips).getByRole("button", { name: "Telugu" })).toHaveAttribute("aria-pressed", "false");
  });

  it("goes back and says so when the change does not go through", async () => {
    const user = userEvent.setup();
    openMe();
    meRoutes({ settings: settings({ languages: ["en"] }), patchSettings: 503 });
    renderWithQuery(<MeSettings />);
    const chips = await languages();
    await user.click(within(chips).getByRole("button", { name: "Hindi" }));
    expect(
      await screen.findByText("We could not change that just now. Try again."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(chips).getByRole("button", { name: "Hindi" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
  });
});

describe("women-only tables", () => {
  it("switches off with that field alone", async () => {
    const user = userEvent.setup();
    openMe(true);
    const at = meRoutes({ settings: settings({ showWomenOnlyTables: true }) });
    renderWithQuery(<MeSettings />);
    const toggle = await screen.findByRole("switch", { name: "Show them in my lists" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    await waitFor(() =>
      expect(at.patchSettings.bodies).toEqual([{ showWomenOnlyTables: false }]),
    );
  });

  it("is not there while tables is closed", async () => {
    openMe(false);
    meRoutes();
    renderWithQuery(
      <>
        <TablesProbe />
        <MeSettings />
      </>,
    );
    await languages();
    await waitFor(() => expect(screen.getByTestId("tables")).toHaveTextContent("off"));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Women-only tables")).toBeNull();
  });
});

describe("while me is closed", () => {
  it("draws nothing and reads nothing", async () => {
    releases({ tables: "all" });
    const at = meRoutes();
    renderWithQuery(
      <>
        <TablesProbe />
        <div data-testid="settings">
          <MeSettings />
        </div>
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("tables")).toHaveTextContent("all"));
    expect(screen.getByTestId("settings")).toBeEmptyDOMElement();
    expect(at.settings.count).toBe(0);
  });
});
