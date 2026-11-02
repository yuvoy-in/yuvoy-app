import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { qk } from "@/lib/query/policy";
import { ADD_WAY_WORDS as A, WAYS_IN_WORDS as W } from "@/lib/auth/use-add-way";
import { refuse } from "@/components/people/people-test-kit";
import { addEmail, numberOnly } from "./ways-in-test-kit";
import { __resetAppRouteMocks } from "../../../mocks/app-route-handlers";

/**
 * Ways in and the email door (yuvoy-app#229; manager, 3 Nov 01:21): a 5xx
 * on the add is a passing failure and leaves the door as it was. Only the
 * API's own door-closed answer (`503 sign_in_unavailable`) reads the config
 * again, and even then the section and its alert stay until Close, on a
 * number-only account too.
 */

const SHUT_SENTENCE =
  "Signing in this way is not open yet. Sign in with your WhatsApp number.";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

describe("a 5xx on the add", () => {
  it.each([
    [
      "a bare 503 with no envelope",
      () => new HttpResponse("", { status: 503 }),
    ],
    [
      "a 503 that is not the door",
      () => refuse(503, "service_unavailable", "Try again soon."),
    ],
    ["a 500", () => refuse(500, "internal_error", "Something broke.")],
    ["a 502", () => new HttpResponse("Bad gateway", { status: 502 })],
  ])(
    "%s: says so, keeps the section, and leaves the door open",
    async (_, reply) => {
      const api = numberOnly();
      const reads = { before: 0 };
      const { user, region, client } = await addEmail(() => {
        reads.before = api.configReads;
        // Shut from here on, so a wrong read would take "Add an email" away.
        api.door = false;
        return reply();
      });

      const alert = await within(region).findByRole("alert");
      expect(alert).toHaveTextContent("We could not connect");
      expect(alert).not.toHaveTextContent("closed");
      expect(client.getQueryState(qk.appConfig())?.isInvalidated).toBe(false);
      expect(api.configReads).toBe(reads.before);

      await user.click(within(region).getByRole("button", { name: A.cancel }));
      expect(
        await within(region).findByRole("button", { name: W.addEmail }),
      ).toBeInTheDocument();
    },
  );
});

describe("the API's door-closed answer", () => {
  it("on a number-only account: the section and its alert stay until Close", async () => {
    const api = numberOnly();
    const reads = { before: 0 };
    const { user, region, client } = await addEmail(() => {
      reads.before = api.configReads;
      api.door = false;
      return refuse(503, "sign_in_unavailable", SHUT_SENTENCE);
    });

    const alert = await within(region).findByRole("alert");
    expect(alert).toHaveTextContent("Adding a way in is closed right now");
    await waitFor(() => expect(api.configReads).toBeGreaterThan(reads.before));
    // The config now says shut; the section and the alert are still there.
    await waitFor(() =>
      expect(
        client.getQueryData<{ features: { signIn: { email: boolean } } }>(
          qk.appConfig(),
        )?.features.signIn.email,
      ).toBe(false),
    );
    expect(screen.getByRole("region", { name: W.title })).toBe(region);
    expect(within(region).getByRole("alert")).toBe(alert);

    await user.click(within(alert).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: W.title })).toBeNull(),
    );
  });
});
