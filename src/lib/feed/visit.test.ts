import { describe, it, expect } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import type { ReelsPage } from "./reels";
import {
  MAX_SKIPPED_PAGES,
  fetchVisitPage,
  heldMediaIds,
  nextVisitCursor,
  type VisitPage,
} from "./visit";

/** A page of reels by media id, with only what the visit logic reads. */
function page(
  ids: string[],
  over: Partial<Pick<ReelsPage, "complete" | "nextCursor">> = {},
): ReelsPage {
  return {
    items: ids.map((id) => ({
      media: { id, kind: "video", posterUrl: "p", aspectRatio: "9:16" },
      experience: { id: `exp_${id}` },
    })) as unknown as ReelsPage["items"],
    complete: over.complete ?? false,
    ...(over.nextCursor ? { nextCursor: over.nextCursor } : {}),
  };
}

const ids = (p: ReelsPage) => (p.items ?? []).map((item) => item.media?.id);

const refused = () =>
  new YuvoyError({
    code: "invalid_input",
    message:
      "that cursor can no longer be used, so start again from the first page",
    status: 400,
  });

/**
 * A fake `GET /reels` that records what it was asked. `answers` maps a cursor
 * (or "first" for none) to a page or an error.
 */
function api(answers: Record<string, ReelsPage | Error>) {
  const asked: (string | undefined)[] = [];
  const fetchPage = async (cursor?: string) => {
    asked.push(cursor);
    const answer = answers[cursor ?? "first"];
    if (!answer) throw new Error(`nothing mocked for ${cursor ?? "first"}`);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { asked, fetchPage };
}

/**
 * One visit of the shuffled order, and the once-only recovery from a cursor
 * minted before the shuffle (yuvoy-app#96).
 */
describe("paging a visit", () => {
  it("asks for a first page with no cursor at all", async () => {
    const { asked, fetchPage } = api({ first: page(["a", "b"]) });
    expect(ids(await fetchVisitPage(undefined, fetchPage))).toEqual(["a", "b"]);
    expect(asked).toEqual([undefined]);
  });

  it("passes a page of the same visit through untouched", async () => {
    const { asked, fetchPage } = api({ c2: page(["c", "d"]) });
    const result = await fetchVisitPage(
      { cursor: "c2", held: ["a", "b"], restarted: false },
      fetchPage,
    );
    expect(ids(result)).toEqual(["c", "d"]);
    expect(result.restartedVisit).toBeUndefined();
    expect(asked).toEqual(["c2"]);
  });

  it("carries the server's cursor and what is already held into the next param", () => {
    const pages: VisitPage[] = [
      page(["a", "b"], { nextCursor: "c2" }),
      page(["c"], { nextCursor: "c3" }),
    ];
    expect(nextVisitCursor(pages[1], pages)).toEqual({
      cursor: "c3",
      held: ["a", "b", "c"],
      restarted: false,
    });
  });

  it("stops on complete, even with a stale cursor left on the page", () => {
    const last = page(["a"], { complete: true, nextCursor: "stale" });
    expect(nextVisitCursor(last, [last])).toBeUndefined();
    expect(nextVisitCursor(page(["a"]), [page(["a"])])).toBeUndefined();
  });
});

describe("a cursor from before the shuffle", () => {
  it("starts a new visit, leaves out what was shown, and carries on from its cursor", async () => {
    /*
      The new visit is the whole catalogue in a new order, so its first page
      holds reels the traveller already scrolled past. Appending it as it came
      would show them again.
    */
    const { asked, fetchPage } = api({
      "pre-shuffle": refused(),
      first: page(["b", "x", "a", "y"], { nextCursor: "v2-2" }),
    });

    const result = await fetchVisitPage(
      { cursor: "pre-shuffle", held: ["a", "b"], restarted: false },
      fetchPage,
    );

    expect(asked).toEqual(["pre-shuffle", undefined]);
    expect(ids(result)).toEqual(["x", "y"]);
    expect(result.nextCursor).toBe("v2-2");
    expect(result.restartedVisit).toBe(true);
    // And the next page param is the new visit's, marked as restarted.
    expect(nextVisitCursor(result, [page(["a", "b"]), result])).toEqual({
      cursor: "v2-2",
      held: ["a", "b", "x", "y"],
      restarted: true,
    });
  });

  it("goes on leaving out the old visit's reels on the pages after the restart", async () => {
    const { fetchPage } = api({ "v2-2": page(["a", "z"], { complete: true }) });
    const result = await fetchVisitPage(
      { cursor: "v2-2", held: ["a", "b", "x", "y"], restarted: true },
      fetchPage,
    );
    expect(ids(result)).toEqual(["z"]);
    expect(result.complete).toBe(true);
  });

  it("skips past a page that held nothing new, so the scroll does not stall", async () => {
    const { asked, fetchPage } = api({
      "pre-shuffle": refused(),
      first: page(["a", "b"], { nextCursor: "v2-2" }),
      "v2-2": page(["c"], { nextCursor: "v2-3" }),
    });
    const result = await fetchVisitPage(
      { cursor: "pre-shuffle", held: ["a", "b"], restarted: false },
      fetchPage,
    );
    expect(asked).toEqual(["pre-shuffle", undefined, "v2-2"]);
    expect(ids(result)).toEqual(["c"]);
    expect(result.nextCursor).toBe("v2-3");
  });

  it("ends honestly when everything left was already shown", async () => {
    // Four reels in production today: a restart can hold nothing new at all.
    const { fetchPage } = api({
      "pre-shuffle": refused(),
      first: page(["a", "b"], { complete: true }),
    });
    const result = await fetchVisitPage(
      { cursor: "pre-shuffle", held: ["a", "b"], restarted: false },
      fetchPage,
    );
    expect(ids(result)).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("does not skip for ever through pages of reels already shown", async () => {
    const answers: Record<string, ReelsPage | Error> = {
      "pre-shuffle": refused(),
      first: page(["a"], { nextCursor: "s1" }),
    };
    for (let i = 1; i <= 10; i++) {
      answers[`s${i}`] = page(["a"], { nextCursor: `s${i + 1}` });
    }
    const { asked, fetchPage } = api(answers);

    const result = await fetchVisitPage(
      { cursor: "pre-shuffle", held: ["a"], restarted: false },
      fetchPage,
    );
    // The refused cursor, the new first page, then the bounded skips.
    expect(asked).toHaveLength(2 + MAX_SKIPPED_PAGES);
    expect(ids(result)).toEqual([]);
    expect(result.nextCursor).toBe(`s${MAX_SKIPPED_PAGES + 1}`);
  });

  it("restarts only ONCE per visit, so a second refusal cannot loop", async () => {
    const { asked, fetchPage } = api({ "v2-2": refused() });
    await expect(
      fetchVisitPage(
        { cursor: "v2-2", held: ["a", "x"], restarted: true },
        fetchPage,
      ),
    ).rejects.toBeInstanceOf(YuvoyError);
    // No first page was asked for: the failure is an ordinary failed page.
    expect(asked).toEqual(["v2-2"]);
  });

  it("keeps today's behaviour for anything that is not a refused cursor", async () => {
    for (const failure of [
      new NetworkError(),
      new YuvoyError({ code: "internal_error", message: "x", status: 500 }),
      new YuvoyError({ code: "unavailable", message: "x", status: 503 }),
    ]) {
      const { asked, fetchPage } = api({ c2: failure });
      await expect(
        fetchVisitPage(
          { cursor: "c2", held: ["a"], restarted: false },
          fetchPage,
        ),
      ).rejects.toBe(failure);
      expect(asked).toEqual(["c2"]);
    }
  });

  it("never restarts a first page, which carried no cursor to refuse", async () => {
    const { asked, fetchPage } = api({ first: refused() });
    await expect(fetchVisitPage(undefined, fetchPage)).rejects.toBeInstanceOf(
      YuvoyError,
    );
    expect(asked).toEqual([undefined]);
  });
});

describe("what is held", () => {
  it("is every media id on every page, in order", () => {
    expect(heldMediaIds([page(["a", "b"]), page(["c"])])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
