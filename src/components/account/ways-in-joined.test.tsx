import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { qk } from "@/lib/query/policy";
import { ADD_WAY_WORDS as A } from "@/lib/auth/use-add-way";
import { ADDRESS, addEmail, numberOnly } from "./ways-in-test-kit";
import { __resetAppRouteMocks } from "../../../mocks/app-route-handlers";

/**
 * A link whose answer was lost but which went through (yuvoy-app#229;
 * api-r0's review, item 3): the account now holds the way in, so the
 * accounts are one and everything that follows the account is read again,
 * exactly as after an answered add.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

/** What follows the account, as `useAddWay`'s own success reads it again. */
const FOLLOWS_THE_ACCOUNT = [
  [qk.myBookings()[0]],
  qk.invitedTrips(),
  qk.savedList("account"),
  qk.savedIds("account"),
];

type Client = Parameters<NonNullable<Parameters<typeof addEmail>[1]>>[0];

/** Every key the screen asks to be read again, from the moment it shows. */
function watchReads() {
  const keys: unknown[] = [];
  const watch = (client: Client) => {
    const invalidate = client.invalidateQueries.bind(client);
    vi.spyOn(client, "invalidateQueries").mockImplementation(
      (filters, options) => {
        keys.push(filters?.queryKey);
        return invalidate(filters, options);
      },
    );
  };
  return { keys, watch };
}

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

describe("no answer from the link", () => {
  it("but the account holds it: bookings, invited trips and saves are read again", async () => {
    const api = numberOnly();
    const reads = watchReads();
    const { region } = await addEmail(() => {
      api.provenEmail = ADDRESS;
      return HttpResponse.error();
    }, reads.watch);

    expect(await within(region).findByRole("status")).toHaveTextContent(
      A.added,
    );
    await waitFor(() =>
      expect(reads.keys).toEqual(expect.arrayContaining(FOLLOWS_THE_ACCOUNT)),
    );
  });

  it("and the account does not hold it: nothing is read again", async () => {
    numberOnly();
    const reads = watchReads();
    const { region } = await addEmail(() => HttpResponse.error(), reads.watch);

    expect(await within(region).findByRole("alert")).toHaveTextContent(
      "We could not confirm that",
    );
    for (const key of FOLLOWS_THE_ACCOUNT) {
      expect(reads.keys).not.toContainEqual(key);
    }
  });
});
