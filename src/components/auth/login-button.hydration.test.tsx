import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
import { LoginButton } from "./login-button";

/**
 * The Login button hydrates to exactly what the server drew.
 *
 * It sits in its own Suspense boundary, so it hydrates after the rest of the
 * page. Once every feed card read the session (saves live on the account when
 * signed in, yuvoy-api#192), the cards' own `/api/session` request could
 * answer before this boundary hydrated, and the button's first client render
 * drew "Login" over the server's held space. WebKit threw React #418 on the
 * feed and on every shared reel, and `e2e/hydration.spec.ts` caught it, but
 * only under the full suite's load, because only then was the boundary slow
 * enough to lose the race.
 *
 * This takes the timing out of it: the server renders with an empty cache, and
 * the client hydrates with a cache that already has the answer, which is the
 * state a sibling that hydrated first leaves behind.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function page(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <LoginButton />
    </QueryClientProvider>
  );
}

describe("LoginButton, hydrating", () => {
  it("draws the server's held space first, even when the session is already known", async () => {
    const html = renderToString(page(new QueryClient()));
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // A sibling that hydrated first has already been told: signed out.
    client.setQueryData(qk.session(), { signedIn: false });

    const mismatches: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, page(client), {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    );

    expect(mismatches).toEqual([]);
    // And one render later, the truth: a way in.
    expect(container.querySelector("a")?.textContent).toBe("Login");

    act(() => root.unmount());
    container.remove();
  });
});
