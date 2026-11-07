import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { useRelease } from "@/lib/site/use-release";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";
import { DateAlertsLink } from "./date-alerts-link";
import { signedIn } from "@/components/trigo/lists-test-kit";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/account",
}));

afterEach(cleanup);

function ReleaseProbe() {
  const release = useRelease("trigo");
  return (
    <p data-testid="release">
      {release.stage} {release.pending ? "pending" : "known"}
    </p>
  );
}

const show = () =>
  renderWithQuery(
    <>
      <ReleaseProbe />
      <DateAlertsLink />
    </>,
  );

/** Account's way to the date alerts (yuvoy-app#220), behind `trigo`. */
describe("the Date alerts button on Account", () => {
  it("opens /account/date-alerts while the release is open", async () => {
    signedIn("all");
    show();
    expect(
      await screen.findByRole("link", { name: W.alertsTitle }),
    ).toHaveAttribute("href", "/account/date-alerts");
  });

  it("is not there while the release is closed", async () => {
    signedIn("off");
    show();
    await waitFor(() =>
      expect(screen.getByTestId("release")).toHaveTextContent("off known"),
    );
    expect(screen.queryByRole("link", { name: W.alertsTitle })).toBeNull();
  });
});
