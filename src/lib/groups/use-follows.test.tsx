import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { followFailure } from "./follows";
import {
  useFollowClub,
  useMyClubFollows,
  useUnfollowClub,
} from "./use-follows";

/**
 * Follow a group through the hooks (yuvoy-mobile#392, web half). The rule
 * under test is decision A: a 404 on any People route is never success. On
 * the list and on Stop following it is People closed; on Follow it is read
 * again, and it is People closed or the group not being there.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const CLUB = "6b1c2d3e-4f50-4a61-8b72-9c0d1e2f3a41";
const OTHER = "6b1c2d3e-4f50-4a61-8b72-9c0d1e2f3a42";

function notFound(message: string) {
  return HttpResponse.json(
    { error: { code: "not_found", message } },
    { status: 404 },
  );
}

/** `GET /app-config` with the people stage, or a 400 when `null`. */
function people(stage: "all" | "off" | null) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      stage === null
        ? HttpResponse.json(
            { error: { code: "invalid_input", message: "x" } },
            { status: 400 },
          )
        : HttpResponse.json({
            minimumVersion: { ios: "0.0.0", android: "0.0.0" },
            features: { payments: "coming_soon", inviteOnly: false },
            support: { whatsappE164: null, hours: "" },
            deliveryHost: null,
            releases: { people: stage },
          }),
    ),
  );
}

/** The follows list: a list, or the 404 of People closed. */
function follows(ids: string[] | "closed") {
  server.use(
    http.get(`${BASE}/me/club-follows`, () =>
      ids === "closed"
        ? notFound("Not found.")
        : HttpResponse.json({
            clubIds: ids,
            clubs: ids.map((id) => ({ clubId: id, slug: id, name: id })),
          }),
    ),
  );
}

/** Counts the writes, and answers each with `answer`. */
function writes(method: "put" | "delete", answer: () => Response) {
  const sent: string[] = [];
  server.use(
    http[method](`${BASE}/me/club-follows/:clubId`, ({ params }) => {
      sent.push(String(params.clubId));
      return answer();
    }),
  );
  return sent;
}

function Probe() {
  const list = useMyClubFollows(true);
  const follow = useFollowClub();
  const unfollow = useUnfollowClub();
  const failure = follow.error ?? unfollow.error ?? list.error;
  return (
    <div>
      <p data-testid="ids">
        {list.data ? list.data.clubIds.join(",") || "none" : "unread"}
      </p>
      <p data-testid="said">{failure ? followFailure(failure).kind : "fine"}</p>
      <p data-testid="done">
        {follow.isSuccess || unfollow.isSuccess ? "taken" : "not taken"}
      </p>
      <button
        type="button"
        onClick={() => {
          follow.follow({ clubId: CLUB });
          follow.follow({ clubId: CLUB });
          follow.follow({ clubId: CLUB });
        }}
      >
        follow
      </button>
      <button type="button" onClick={() => unfollow.unfollow({ clubId: CLUB })}>
        unfollow
      </button>
    </div>
  );
}

const shows = (id: string, text: string) =>
  waitFor(() => expect(screen.getByTestId(id)).toHaveTextContent(text));

beforeEach(() => __signInAppRouteMock());

describe("the follows list", () => {
  it("reads the groups followed", async () => {
    follows([OTHER]);
    renderWithQuery(<Probe />);
    await shows("ids", OTHER);
    expect(screen.getByTestId("said")).toHaveTextContent("fine");
  });

  it("reads its 404 as People closed, not as an empty list", async () => {
    follows("closed");
    renderWithQuery(<Probe />);
    await shows("said", "closed");
    expect(screen.getByTestId("ids")).toHaveTextContent("unread");
  });
});

describe("Follow", () => {
  it("adds the group once the API takes it, one request for a burst of taps", async () => {
    follows([OTHER]);
    const sent = writes("put", () => new HttpResponse(null, { status: 204 }));
    renderWithQuery(<Probe />);
    await shows("ids", OTHER);
    fireEvent.click(screen.getByText("follow"));
    await shows("ids", `${CLUB},${OTHER}`);
    expect(sent).toEqual([CLUB]);
    expect(screen.getByTestId("done")).toHaveTextContent("taken");
  });

  it("reads a 404 with People open as the group not there, and reads the directory again", async () => {
    people("all");
    follows([OTHER]);
    writes("put", () => notFound("We couldn't find that group."));
    const { client } = renderWithQuery(<Probe />);
    client.setQueryData(["listClubs", "kochi"], { items: [] });
    await shows("ids", OTHER);
    fireEvent.click(screen.getByText("follow"));
    await shows("said", "gone");
    expect(screen.getByTestId("done")).toHaveTextContent("not taken");
    expect(screen.getByTestId("ids")).toHaveTextContent(OTHER);
    expect(screen.getByTestId("ids")).not.toHaveTextContent(CLUB);
    await waitFor(() =>
      expect(client.getQueryState(["listClubs", "kochi"])?.isInvalidated).toBe(
        true,
      ),
    );
  });

  it("reads a 404 as People closed when the release no longer admits the caller", async () => {
    people("off");
    follows([OTHER]);
    writes("put", () => notFound("Not found."));
    renderWithQuery(<Probe />);
    await shows("ids", OTHER);
    fireEvent.click(screen.getByText("follow"));
    await shows("said", "closed");
    expect(screen.getByTestId("done")).toHaveTextContent("not taken");
  });

  it("asks the follows list when the releases cannot be read", async () => {
    people(null);
    follows([OTHER]);
    writes("put", () => notFound("Not found."));
    renderWithQuery(<Probe />);
    await shows("ids", OTHER);
    follows("closed");
    fireEvent.click(screen.getByText("follow"));
    await shows("said", "closed");
    expect(screen.getByTestId("done")).toHaveTextContent("not taken");
  });

  it("names the limit and leaves the list as it was", async () => {
    follows([OTHER]);
    writes("put", () =>
      HttpResponse.json(
        {
          error: {
            code: "follow_limit_reached",
            message:
              "You follow 200 groups already. Stop following one to follow another.",
          },
        },
        { status: 409 },
      ),
    );
    renderWithQuery(<Probe />);
    await shows("ids", OTHER);
    fireEvent.click(screen.getByText("follow"));
    await shows("said", "limit");
    expect(screen.getByTestId("ids")).toHaveTextContent(OTHER);
    expect(screen.getByTestId("ids")).not.toHaveTextContent(CLUB);
  });
});

describe("Stop following", () => {
  it("drops the group once the API takes it", async () => {
    follows([CLUB, OTHER]);
    writes("delete", () => new HttpResponse(null, { status: 204 }));
    renderWithQuery(<Probe />);
    await shows("ids", `${CLUB},${OTHER}`);
    fireEvent.click(screen.getByText("unfollow"));
    await shows("done", "taken");
    expect(screen.getByTestId("ids")).toHaveTextContent(OTHER);
    expect(screen.getByTestId("ids")).not.toHaveTextContent(CLUB);
  });

  it("reads its 404 as People closed and leaves the list as it was", async () => {
    follows([CLUB, OTHER]);
    writes("delete", () => notFound("Not found."));
    renderWithQuery(<Probe />);
    await shows("ids", `${CLUB},${OTHER}`);
    fireEvent.click(screen.getByText("unfollow"));
    await shows("said", "closed");
    expect(screen.getByTestId("done")).toHaveTextContent("not taken");
    expect(screen.getByTestId("ids")).toHaveTextContent(`${CLUB},${OTHER}`);
  });
});
