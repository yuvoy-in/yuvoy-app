import { describe, expect, it } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { GuideListings } from "./guide-listings";
import { server } from "../../../mocks/server";

/*
  The foot of a guide (yuvoy-app#116 item 4): the listings its filter finds,
  and nothing at all otherwise. Not while it loads, not when nothing is on
  sale, not when the read fails.
*/

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

describe("GuideListings", () => {
  it("lists what the guide's filter finds, each a way to the listing", async () => {
    renderWithQuery(<GuideListings filter={{ activityType: "scuba" }} />);

    const foot = await screen.findByRole("region", { name: "On Yuvoy" });
    expect(
      within(foot)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/e/try-dive-nemo-reef"]);
  });

  it("shows no heading when nothing is on sale that matches", async () => {
    const { client, container } = renderWithQuery(
      // A type the mock has no listing for: an empty page, as the API answers.
      <GuideListings filter={{ activityType: "paragliding" }} />,
    );

    await waitFor(() =>
      expect(
        client.getQueryState(qk.guideListings(undefined, "paragliding"))
          ?.status,
      ).toBe("success"),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no heading when the read fails", async () => {
    server.use(
      http.get(`${BASE}/reels`, () =>
        HttpResponse.json(
          { error: { code: "invalid_input", message: "Not a category." } },
          { status: 400 },
        ),
      ),
    );
    const { client, container } = renderWithQuery(
      <GuideListings filter={{ category: "adventure" }} />,
    );

    await waitFor(() =>
      expect(
        client.getQueryState(qk.guideListings("adventure", undefined))?.status,
      ).toBe("error"),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing on the server, so the static guide hydrates cleanly", async () => {
    /*
      A guide is a static page. The server cannot read the listings, so it
      draws an empty foot, and the first client render must draw the same;
      the listings arrive one read later.
    */
    function foot(client: QueryClient) {
      return (
        <QueryClientProvider client={client}>
          <GuideListings filter={{ activityType: "scuba" }} />
        </QueryClientProvider>
      );
    }

    const html = renderToString(foot(new QueryClient()));
    expect(html).toBe("");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const mismatches: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, foot(new QueryClient()), {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    );

    await within(container).findByRole("region", { name: "On Yuvoy" });
    expect(mismatches).toEqual([]);

    act(() => root.unmount());
    container.remove();
  });
});
