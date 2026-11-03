import { describe, it, expect } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  PEOPLE_FAILURE_WORDS,
  PEOPLE_SHUT_LINE,
  PeopleShutError,
} from "@/lib/people/people-stand-ins";
import {
  FOLLOW_API_WORDS,
  FOLLOW_LIMIT,
  FOLLOW_WORDS,
  followFailure,
  followsAfter,
  isFollowing,
  type ClubFollows,
} from "./follows";

/** Follow a group (yuvoy-mobile#392, web half): words, failures, the list. */

function refusal(
  status: number,
  code: string,
  message = "",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

const A = { clubId: "c-a", slug: "a", name: "Alpha Runners" };
const B = { clubId: "c-b", slug: "b", name: "Bay Swimmers" };
const list = (...clubs: (typeof A)[]): ClubFollows => ({
  clubIds: clubs.map((c) => c.clubId),
  clubs,
});

describe("follow words", () => {
  it("keeps mobile's lines", () => {
    expect(FOLLOW_WORDS.followLabel("Alpha Runners")).toBe(
      "Follow Alpha Runners",
    );
    expect(FOLLOW_WORDS.followingLabel("Alpha Runners")).toBe(
      "Following Alpha Runners",
    );
    expect(FOLLOW_WORDS.lead("Kochi")).toBe(
      "Clubs and communities in Kochi that meet regularly. Follow the ones you like.",
    );
    expect(FOLLOW_API_WORDS.limit).toBe(
      "You follow 200 groups already. Stop following one to follow another.",
    );
    expect(FOLLOW_LIMIT).toBe(200);
  });
});

describe("what a failed follow says", () => {
  it("says People closed for the closed error, never success", () => {
    const f = followFailure(new PeopleShutError());
    expect(f.kind).toBe("closed");
    expect(f.line).toBe(PEOPLE_SHUT_LINE);
    expect(f.retry).toBe(false);
  });

  it("reads a 404 that stayed a 404 as the group not being there", () => {
    const f = followFailure(
      refusal(404, "not_found", "We couldn't find that group."),
    );
    expect(f.kind).toBe("gone");
    expect(f.line).toBe(FOLLOW_API_WORDS.gone);
  });

  it("names each People refusal", () => {
    expect(followFailure(refusal(401, "unauthorized")).line).toBe(
      PEOPLE_FAILURE_WORDS.signIn,
    );
    expect(
      followFailure(refusal(403, "adult_confirmation_required")).kind,
    ).toBe("age");
    expect(followFailure(refusal(403, "people_paused")).kind).toBe("paused");
    expect(
      followFailure(refusal(403, "people_paused", "", { standing: "removed" }))
        .kind,
    ).toBe("ended");
    expect(followFailure(refusal(409, "name_required")).line).toBe(
      PEOPLE_FAILURE_WORDS.name,
    );
  });

  it("uses the API's limit line, and its own when the answer has none", () => {
    expect(
      followFailure(refusal(409, "follow_limit_reached", "Stop one first."))
        .line,
    ).toBe("Stop one first.");
    const f = followFailure(refusal(409, "follow_limit_reached"));
    expect(f.kind).toBe("limit");
    expect(f.line).toBe(FOLLOW_API_WORDS.limit);
    expect(f.retry).toBe(false);
  });

  it("offers Try again for no signal, a pause and a fault", () => {
    expect(followFailure(new NetworkError())).toMatchObject({
      kind: "noSignal",
      retry: true,
    });
    expect(followFailure(refusal(503, "service_unavailable"))).toMatchObject({
      kind: "down",
      line: FOLLOW_API_WORDS.down,
      retry: true,
    });
    // A 503 without the API's error body shows our line, not "The server answered 503."
    expect(
      followFailure(refusal(503, "internal_error", "The server answered 503.")),
    ).toMatchObject({ kind: "down", line: FOLLOW_API_WORDS.down });
    expect(followFailure(refusal(500, "internal_error"))).toMatchObject({
      kind: "fault",
      retry: true,
    });
    expect(followFailure(new Error("boom")).kind).toBe("fault");
  });
});

describe("the follows list after a tap", () => {
  it("leaves a list not read yet unread", () => {
    expect(followsAfter(undefined, A.clubId, true, A)).toBeUndefined();
  });

  it("puts a new follow first, with its name when the page gave one", () => {
    const after = followsAfter(list(B), A.clubId, true, A);
    expect(after?.clubIds).toEqual([A.clubId, B.clubId]);
    expect(after?.clubs).toEqual([A, B]);
    expect(isFollowing(after, A.clubId)).toBe(true);
  });

  it("adds only the id when the page gave no name", () => {
    const after = followsAfter(list(B), A.clubId, true);
    expect(after?.clubIds).toEqual([A.clubId, B.clubId]);
    expect(after?.clubs).toEqual([B]);
  });

  it("keeps a group already followed where it was", () => {
    const old = list(B, A);
    expect(followsAfter(old, A.clubId, true, A)).toBe(old);
  });

  it("drops an unfollowed group from both lists", () => {
    const after = followsAfter(list(A, B), A.clubId, false);
    expect(after).toEqual(list(B));
    expect(isFollowing(after, A.clubId)).toBe(false);
  });

  it("leaves the list alone for an unfollow of a group not in it", () => {
    const old = list(B);
    expect(followsAfter(old, A.clubId, false)).toBe(old);
  });
});
