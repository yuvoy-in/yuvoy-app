import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareLink } from "./share-link";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetOutcomeCollector,
  outcomeCollector,
} from "@/lib/analytics/outcomes";

/**
 * A share counted as `shared` once the link has gone (yuvoy-app#181): by the
 * share sheet, or onto the clipboard where there is none. A sheet closed
 * without sending is not a share.
 */

/*
  The two properties, never the whole navigator, and after `userEvent.setup()`
  (see link-actions.test.tsx for both traps).
*/
function patchNavigator(props: {
  writeText?: () => Promise<void>;
  share?: ((data: ShareData) => Promise<void>) | undefined;
}) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: props.writeText ?? vi.fn(async () => {}) },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: props.share,
    configurable: true,
    writable: true,
  });
}

const OUTCOME = {
  subjectId: "exp_try_dive",
  surface: "feed" as const,
  position: 2,
};

const waiting = () =>
  outcomeCollector()
    .inspect()
    .waiting.map((e) => `${e.kind} ${e.surface} ${e.subjectId} ${e.position}`);

beforeEach(() => {
  __resetOutcomeCollector();
  setConsent("granted");
});
afterEach(() => {
  cleanup();
  setConsent("denied");
  __resetOutcomeCollector();
});

describe("ShareLink", () => {
  it("records shared when the link is copied", async () => {
    const user = userEvent.setup();
    patchNavigator({ share: undefined });
    render(
      <ShareLink
        path="/r/med_1"
        title="Try-dive"
        label="Share this reel"
        outcome={OUTCOME}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share this reel" }));
    await screen.findByText("Link copied");
    expect(waiting()).toEqual(["shared feed exp_try_dive 2"]);
  });

  it("records shared when the share sheet sends it", async () => {
    const user = userEvent.setup();
    patchNavigator({ share: vi.fn(async () => {}) });
    render(
      <ShareLink
        path="/r/med_1"
        title="Try-dive"
        label="Share this reel"
        outcome={OUTCOME}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share this reel" }));
    await waitFor(() =>
      expect(waiting()).toEqual(["shared feed exp_try_dive 2"]),
    );
  });

  it("records nothing for a share sheet closed without sending", async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {
      throw new DOMException("closed", "AbortError");
    });
    patchNavigator({ share });
    render(
      <ShareLink
        path="/r/med_1"
        title="Try-dive"
        label="Share this reel"
        outcome={OUTCOME}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share this reel" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(waiting()).toEqual([]);
  });

  it("records nothing without a card to count, or without consent", async () => {
    const user = userEvent.setup();
    patchNavigator({ share: undefined });
    const { unmount } = render(
      <ShareLink path="/r/med_1" title="Try-dive" label="Share this reel" />,
    );
    await user.click(screen.getByRole("button", { name: "Share this reel" }));
    await screen.findByText("Link copied");
    unmount();

    setConsent("denied");
    render(
      <ShareLink
        path="/r/med_1"
        title="Try-dive"
        label="Share this reel"
        outcome={OUTCOME}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share this reel" }));
    await screen.findByText("Link copied");
    expect(waiting()).toEqual([]);
  });
});
