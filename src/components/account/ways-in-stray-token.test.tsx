import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { ADD_WAY_WORDS as A } from "@/lib/auth/use-add-way";
import { ADDRESS, addEmail, numberOnly } from "./ways-in-test-kit";
import { __resetAppRouteMocks } from "../../../mocks/app-route-handlers";

/**
 * A link answer that carries a session token by mistake (yuvoy-app#229,
 * case 15 of api-r0's review): the add keeps nothing of it. The mutation
 * forgets its state as soon as the form goes (`gcTime: 0`), so every state
 * it passes through is caught as it happens, from the screen's first show.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

type Client = Parameters<NonNullable<Parameters<typeof addEmail>[1]>>[0];

const STRAY = "sess_stray";

/** Every key and value a storage holds. */
function everything(storage: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i) ?? "";
    out.push(key, storage.getItem(key) ?? "");
  }
  return out;
}

beforeEach(() => {
  __resetAppRouteMocks();
  // eslint-disable-next-line no-restricted-syntax -- emptied so the test can prove the token never lands there.
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("a stray sessionToken on the link answer", () => {
  it("is not in the add's own result, at any step, nor in storage", async () => {
    const api = numberOnly();
    const states: Array<{
      add: boolean;
      status: string;
      data: unknown;
      json: string;
    }> = [];
    const watch = (client: Client) => {
      client.getMutationCache().subscribe((event) => {
        const state = event.mutation?.state;
        if (!state) return;
        states.push({
          // The add takes the code; the code request before it does not.
          add: Boolean(
            state.variables &&
            typeof state.variables === "object" &&
            "code" in state.variables,
          ),
          status: state.status,
          data: state.data,
          json: JSON.stringify(state),
        });
      });
    };
    const { region } = await addEmail(() => {
      api.provenEmail = ADDRESS;
      return HttpResponse.json(
        { linked: true, sessionToken: STRAY },
        { status: 201 },
      );
    }, watch);

    expect(await within(region).findByRole("status")).toHaveTextContent(
      A.added,
    );
    /*
      The code request's own answer carries `devCode` in development, so only
      the add's states are held to "no data"; every state, the request's
      included, is still held to "no token".
    */
    const done = states.filter(
      (state) => state.add && state.status === "success",
    );
    expect(done.length).toBeGreaterThan(0);
    for (const state of done) expect(state.data).toBeUndefined();
    for (const state of states) expect(state.json).not.toContain(STRAY);

    const stored = [
      ...everything(localStorage),
      ...everything(sessionStorage),
      document.cookie,
    ].join("|");
    expect(stored).not.toContain(STRAY);
    expect(document.body.innerHTML).not.toContain(STRAY);
  });
});
