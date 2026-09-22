import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetReelViewCollector,
  reelViewCollector,
} from "@/lib/analytics/reel-views";
import { useReelViews, type ReelWatch } from "./use-reel-views";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** Every `POST /reel-views` that reached the API, as it arrived. */
function captureViews() {
  const calls: { auth: string | null; url: string; events: unknown[] }[] = [];
  server.use(
    http.post(`${BASE}/reel-views`, async ({ request }) => {
      const body = (await request.json()) as { events: unknown[] };
      calls.push({
        auth: request.headers.get("authorization"),
        url: request.url,
        events: body.events,
      });
      return HttpResponse.json(
        { accepted: body.events.length, dropped: 0, droppedEvents: [] },
        { status: 202 },
      );
    }),
  );
  return calls;
}

/** The strip's use of the hook, with nothing else around it. */
function Strip({
  reelId,
  onWatch,
}: {
  reelId: string | null;
  onWatch?: (watch: ReelWatch) => void;
}) {
  const watch = useReelViews(
    reelId ? { reelId, experienceId: `exp_${reelId}` } : null,
  );
  onWatch?.(watch);
  return null;
}

/** Moves the clock the collector reads, the way time passing would. */
const later = (ms: number) =>
  act(() => {
    vi.setSystemTime(Date.now() + ms);
  });

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
  __resetReelViewCollector();
});

afterEach(() => {
  cleanup();
  setVisibility("visible");
  __resetReelViewCollector();
  vi.useRealTimers();
});

/**
 * Reel views from the strip (yuvoy-app#96), under the owner's ruling: only
 * with analytics consent, anonymously, and never stored.
 */
describe("reel views from the strip", () => {
  it("sends one view per reel, anonymously and straight to the API, when the reels are left", async () => {
    setConsent("granted");
    const calls = captureViews();
    let watch!: ReelWatch;

    const { rerender, unmount } = render(
      <Strip reelId="med_dive" onWatch={(w) => (watch = w)} />,
    );
    act(() => watch.played(1_500));
    later(2_000);
    rerender(<Strip reelId="med_snorkel" onWatch={(w) => (watch = w)} />);
    later(1_000);
    unmount();

    await waitFor(() => expect(calls).toHaveLength(1));
    const [call] = calls;
    // No session, no header: the views are anonymous.
    expect(call.auth).toBeNull();
    expect(call.url).toBe(`${BASE}/reel-views`);
    expect(call.events).toEqual([
      expect.objectContaining({
        reelId: "med_dive",
        experienceId: "exp_med_dive",
        watchedMs: 1_500,
        completed: false,
        viewedAt: "2026-09-21T10:00:00Z",
      }),
      expect.objectContaining({
        reelId: "med_snorkel",
        watchedMs: 0,
        viewedAt: "2026-09-21T10:00:02Z",
      }),
    ]);
  });

  it("sends nothing at all when consent was refused", async () => {
    /*
      "Not asked yet" is the same answer, and is pinned where it can be set:
      the collector's own tests. The consent store caches its snapshot for the
      life of this file, so "unset" cannot be restored here once a test above
      has granted it.
    */
    setConsent("denied");
    const calls = captureViews();
    let watch!: ReelWatch;
    const { unmount } = render(
      <Strip reelId="med_dive" onWatch={(w) => (watch = w)} />,
    );
    act(() => watch.played(5_000));
    later(5_000);
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
  });

  it("stops the moment consent is withdrawn, and drops the view on screen", async () => {
    setConsent("granted");
    const calls = captureViews();
    const { rerender, unmount } = render(<Strip reelId="med_dive" />);
    later(2_000);
    // Two finished views wait in memory...
    rerender(<Strip reelId="med_snorkel" />);
    later(2_000);

    act(() => setConsent("denied"));
    later(2_000);
    unmount();
    await new Promise((r) => setTimeout(r, 30));

    // ...and none of them, nor the one on screen, is ever sent.
    expect(calls).toEqual([]);
  });

  it("sends what it has when the page is hidden, and starts a new view when it is back", async () => {
    setConsent("granted");
    const calls = captureViews();
    const { unmount } = render(<Strip reelId="med_dive" />);
    later(2_000);

    setVisibility("hidden");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].events).toHaveLength(1);

    // Back to the tab: the traveller is watching again, which is a new view.
    setVisibility("visible");
    later(2_000);
    unmount();
    await waitFor(() => expect(calls).toHaveLength(2));

    const first = calls[0].events[0] as { eventId: string };
    const second = calls[1].events[0] as { eventId: string; reelId: string };
    expect(second.reelId).toBe("med_dive");
    expect(second.eventId).not.toBe(first.eventId);
  });

  it("sends what it has when the page goes away, with keepalive so it outlives it", async () => {
    setConsent("granted");
    const calls = captureViews();
    const flush = vi.spyOn(reelViewCollector(), "flush");
    render(<Strip reelId="med_dive" />);
    later(2_000);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    // The request has to survive the page it was sent from.
    expect(flush).toHaveBeenCalledWith({ keepalive: true });
  });

  it("reports nothing for a strip with no reel on screen", async () => {
    setConsent("granted");
    const calls = captureViews();
    const { unmount } = render(<Strip reelId={null} />);
    later(5_000);
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
  });
});
