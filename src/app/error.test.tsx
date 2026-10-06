import { describe, it, expect, vi, afterEach } from "vitest";
import { Suspense, use, useState } from "react";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import AppError from "./error";

/**
 * The route's error screen, and what Try again does (stability audit,
 * 6 Oct 2026): it asks the server again, and with no signal it waits for one
 * rather than trading this screen for the offline page.
 */

vi.mock("@/lib/observability/report", () => ({ captureError: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/o/sample-boat-operator",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

/** An error the server rendered: it reaches the browser with a digest. */
const rendered = Object.assign(new Error("An error occurred"), {
  digest: "1234567890",
});

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function shown() {
  const retry = vi.fn();
  const reset = vi.fn();
  const view = renderWithQuery(
    // Next hands an error screen both; only one of them fetches again.
    <AppError
      error={rendered}
      {...({ reset } as Record<string, unknown>)}
      retry={retry}
    />,
  );
  return { retry, reset, ...view };
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("Try again on the route's error screen", () => {
  it("asks the server again, rather than drawing the same failure", async () => {
    const { retry, reset } = shown();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("with no signal, says so, and asks once the signal is back", async () => {
    setOnline(false);
    const { retry } = shown();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).not.toHaveBeenCalled();
    expect(screen.getByText("No connection")).toBeInTheDocument();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("asks once, however often it was tapped with no signal", async () => {
    setOnline(false);
    const { retry } = shown();
    const again = screen.getByRole("button", { name: "Try again" });
    await userEvent.click(again);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("turns busy while the server is asked, rather than looking idle", async () => {
    /*
      Next's retry is a refresh in a transition, and the screen stays up
      until the new read lands. Stood in for here by a transition that waits
      on a read that never answers.
    */
    function Waiting({ read }: { read: Promise<void> }) {
      use(read);
      return null;
    }
    function Boundary() {
      const [read, setRead] = useState<Promise<void> | null>(null);
      return (
        <Suspense fallback={null}>
          {read ? <Waiting read={read} /> : null}
          <AppError
            error={rendered}
            retry={() => setRead(new Promise<void>(() => {}))}
          />
        </Suspense>
      );
    }
    renderWithQuery(<Boundary />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    const busy = await screen.findByRole("button", { busy: true });
    expect(busy).toHaveTextContent("Trying again");
  });

  it("asks nothing once the screen has gone", async () => {
    setOnline(false);
    const { retry, unmount } = shown();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    unmount();

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(retry).not.toHaveBeenCalled();
  });
});
