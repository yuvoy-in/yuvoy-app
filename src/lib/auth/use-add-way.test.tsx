import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { server } from "../../../mocks/server";
import { canAddWay, showsWaysIn, useAddWay, waysIn } from "./use-add-way";

/**
 * Ways in (yuvoy-app#229): what `GET /me` says an account signs in with,
 * what can be added, and the add itself over `/api/session/link`.
 */

describe("waysIn", () => {
  it("reads an email account with its address, trimmed", () => {
    expect(
      waysIn({
        phone: "+919000000000",
        emailProven: true,
        provenEmail: "  asha@example.com ",
      }),
    ).toEqual({
      email: true,
      emailAddress: "asha@example.com",
      phone: "+919000000000",
    });
  });

  it("keeps the email when /me does not name the address (the row says Added)", () => {
    expect(
      waysIn({ phone: null, emailProven: true, provenEmail: null }),
    ).toEqual({ email: true, emailAddress: null, phone: null });
  });

  it("reads a number-only account", () => {
    expect(
      waysIn({
        phone: "+919000000000",
        emailProven: false,
        provenEmail: null,
      }),
    ).toEqual({ email: false, emailAddress: null, phone: "+919000000000" });
  });

  it("counts a field left out as not there", () => {
    expect(waysIn({})).toEqual({
      email: false,
      emailAddress: null,
      phone: null,
    });
    // An address without emailProven is not a way in.
    expect(waysIn({ provenEmail: "asha@example.com" }).email).toBe(false);
  });
});

const numberOnly = waysIn({ phone: "+919000000000", emailProven: false });
const emailOnly = waysIn({
  phone: null,
  emailProven: true,
  provenEmail: "asha@example.com",
});
const both = waysIn({
  phone: "+919000000000",
  emailProven: true,
  provenEmail: "asha@example.com",
});

describe("canAddWay", () => {
  it("offers nothing while the email door is shut", () => {
    for (const ways of [numberOnly, emailOnly]) {
      expect(canAddWay(ways, "email", false)).toBe(false);
      expect(canAddWay(ways, "phone", false)).toBe(false);
    }
  });

  it("offers an email, not a number, to a number-only account", () => {
    expect(canAddWay(numberOnly, "email", true)).toBe(true);
    expect(canAddWay(numberOnly, "phone", true)).toBe(false);
  });

  it("offers a number to an email-only account", () => {
    expect(canAddWay(emailOnly, "phone", true)).toBe(true);
    expect(canAddWay(emailOnly, "email", true)).toBe(false);
  });
});

describe("showsWaysIn", () => {
  it("is hidden for a number-only account while the door is shut", () => {
    expect(showsWaysIn(numberOnly, false)).toBe(false);
  });

  it("shows an email account with the door shut, with no add button", () => {
    expect(showsWaysIn(both, false)).toBe(true);
    expect(canAddWay(both, "email", false)).toBe(false);
    expect(canAddWay(both, "phone", false)).toBe(false);
  });
});

/** `POST /api/session/link` answering `body` at `status`, keeping what it was sent. */
function link(status: number, body: JsonBodyType) {
  const sent: unknown[] = [];
  server.use(
    http.post("*/api/session/link", async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(body, { status });
    }),
  );
  return sent;
}

function addWay() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidated = vi.spyOn(client, "invalidateQueries");
  const { result } = renderHook(() => useAddWay(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  /**
   * The add, inside `act`, so its state lands before the next line. Wrapped
   * in an async function so it returns a real Promise: React 19's `act`
   * returns a thenable with no `.catch`, and a refusal caught with `.catch`
   * on it threw instead, left the act scope open and broke every later test.
   */
  const run = async (input: Parameters<typeof result.current.mutateAsync>[0]) =>
    act(() => result.current.mutateAsync(input));
  return { run, invalidated };
}

describe("useAddWay", () => {
  it("posts an address and a code, trimmed, with no number", async () => {
    const sent = link(201, { linked: true });
    const { run } = addWay();
    await run({
      email: "  asha@example.com ",
      code: " 123456 ",
    });
    expect(sent).toEqual([{ email: "asha@example.com", code: "123456" }]);
  });

  it("posts a number and a code, trimmed, with no address", async () => {
    const sent = link(201, { linked: true });
    const { run } = addWay();
    await run({
      phone: " +919811122233 ",
      code: "123456",
    });
    expect(sent).toEqual([{ phone: "+919811122233", code: "123456" }]);
  });

  it("resolves only on 201 linked: true", async () => {
    link(200, { linked: true });
    const { run } = addWay();
    await expect(
      run({ email: "asha@example.com", code: "123456" }),
    ).rejects.toThrow("ways in: the answer added nothing");

    link(201, { linked: false });
    await expect(
      run({ email: "asha@example.com", code: "123456" }),
    ).rejects.toThrow("ways in: the answer added nothing");
  });

  it("throws a refusal as the typed error, by status and code", async () => {
    link(409, {
      error: {
        code: "identity_taken",
        message:
          "That already signs in to another account. Sign in with it there instead.",
      },
    });
    const { run } = addWay();
    const error = await run({
      email: "asha@example.com",
      code: "123456",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YuvoyError);
    expect((error as YuvoyError).status).toBe(409);
    expect((error as YuvoyError).code).toBe("identity_taken");
  });

  it("reads the account, bookings, invited trips and saves again on success", async () => {
    link(201, { linked: true });
    const { run, invalidated } = addWay();
    await run({
      email: "asha@example.com",
      code: "123456",
    });
    const keys = invalidated.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        qk.myAccount(),
        [qk.myBookings()[0]],
        qk.invitedTrips(),
        qk.savedList("account"),
        qk.savedIds("account"),
      ]),
    );
  });

  it("reads nothing again when nothing was added", async () => {
    link(409, {
      error: { code: "identity_kind_taken", message: "No" },
    });
    const { run, invalidated } = addWay();
    await run({ email: "asha@example.com", code: "123456" }).catch(
      () => undefined,
    );
    expect(invalidated).not.toHaveBeenCalled();
  });
});
