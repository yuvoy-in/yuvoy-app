import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The analytics answer, to change at any time (yuvoy-app#181): what the
 * question's "change it any time" promises. Off stops the counting at once.
 */

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

async function setting() {
  vi.resetModules();
  const consent = await import("@/lib/analytics/consent");
  const outcomes = await import("@/lib/analytics/outcomes");
  const { UsageSetting } = await import("./usage-setting");
  render(<UsageSetting />);
  return { consent, outcomes };
}

describe("usage counts", () => {
  it("says nothing is sent before the question is answered, and turns on", async () => {
    const user = userEvent.setup();
    const { consent } = await setting();
    const control = screen.getByRole("switch", {
      name: "Count what I watch and open",
    });
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "You have not been asked yet. Nothing is sent until you say yes.",
      ),
    ).toBeInTheDocument();

    await user.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(consent.outcomesConsented()).toBe(true);
    expect(sessionStorage.getItem("yuvoy.consent.analytics")).toBe("granted:2");
  });

  it("stops counting the moment it is turned off, and drops what is queued", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("yuvoy.consent.analytics", "granted:2");
    const { consent, outcomes } = await setting();
    outcomes.recordOutcome({
      kind: "opened",
      subjectId: "exp_try_dive",
      surface: "listing",
    });
    expect(outcomes.outcomeCollector().inspect().waiting).toHaveLength(1);

    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(consent.consentSnapshot()).toBe("denied");
    expect(outcomes.outcomeCollector().inspect().waiting).toEqual([]);
    expect(
      screen.getByText("Off. Nothing about how you use the app is sent."),
    ).toBeInTheDocument();
    outcomes.__resetOutcomeCollector();
  });

  it("describes a yes to the older words as what it counts: views", async () => {
    sessionStorage.setItem("yuvoy.consent.analytics", "granted");
    await setting();
    const control = screen.getByRole("switch", { name: "Count my views" });
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText("Which reels I watch, and for how long. Anonymous."),
    ).toBeInTheDocument();
  });

  it("follows an answer given on the card", async () => {
    const { consent } = await setting();
    await act(async () => consent.setConsent("granted"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(
        "On. Turning it off stops the counting from this moment.",
      ),
    ).toBeInTheDocument();
  });
});
