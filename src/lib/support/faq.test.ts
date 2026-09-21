import { describe, it, expect } from "vitest";
import { FAQ, allFaqItems, searchFaq } from "./faq";

/**
 * The Help Center's answers, and the one rule they all have to keep.
 *
 * **Mechanics, never policy.** A cancellation policy is frozen onto each
 * booking at checkout from the listing that sold it, so there is no single
 * policy to state centrally. A percentage or a window written here would be
 * wrong for somebody's booking the day an operator changed theirs, and wrong
 * in the direction that makes people feel tricked by terms they did agree to.
 *
 * That is asserted rather than trusted, because it is exactly the kind of
 * helpful-sounding detail somebody adds later without knowing why it is absent.
 */
describe("the answers", () => {
  it("state no refund percentage, window or fee", () => {
    const offenders = allFaqItems().filter((item) =>
      item.answer.some((paragraph) =>
        /\b\d+\s*%|\b\d+\s*(hours?|days?)\s+(before|after|of)\b|\bnon-?refundable\b/i.test(
          paragraph,
        ),
      ),
    );

    expect(offenders.map((o) => o.id)).toEqual([]);
  });

  it("promises no ticket tracking, because there is no endpoint behind one", () => {
    /*
      `POST /support/requests` is the whole support surface: a message in, a
      reference out, and a person replies on WhatsApp. No list, no status, no
      history. Copy implying otherwise would be a lie with a progress bar on
      it. yuvoy-api#196 is the gap.
    */
    const offenders = allFaqItems().filter((item) =>
      item.answer.some((paragraph) =>
        /\btrack (your|the) (ticket|request)\b|\bticket status\b|\bcheck back here\b/i.test(
          paragraph,
        ),
      ),
    );

    expect(offenders.map((o) => o.id)).toEqual([]);
  });

  it("gives every item a unique id, since the id is an anchor", () => {
    const ids = allFaqItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves no category empty", () => {
    for (const category of FAQ) {
      expect(category.items.length, category.key).toBeGreaterThan(0);
    }
  });
});

describe("search", () => {
  it("returns everything for an empty query", () => {
    expect(searchFaq("").length).toBe(allFaqItems().length);
    expect(searchFaq("   ").length).toBe(allFaqItems().length);
  });

  it("matches the question", () => {
    const hits = searchFaq("cancel");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /cancel/i.test(h.question))).toBe(true);
  });

  it("matches inside the ANSWER, not only the heading", () => {
    /*
      The load-bearing half. A traveller types the word that is on their screen
      rather than the phrasing somebody chose for a heading: "reference" and
      "cash" are both words the app shows them and neither leads a question.
    */
    const hits = searchFaq("reference");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.answer.some((p) => /reference/i.test(p)))).toBe(
      true,
    );
  });

  it("ignores case and surrounding space", () => {
    expect(searchFaq("  CASH  ").length).toBe(searchFaq("cash").length);
    expect(searchFaq("cash").length).toBeGreaterThan(0);
  });

  it("answers nothing for a word that is not there, rather than everything", () => {
    // The failure mode worth pinning: a filter that falls back to the full
    // list on no match turns "no results" into "here is the manual".
    expect(searchFaq("zzzznotathing")).toEqual([]);
  });
});
