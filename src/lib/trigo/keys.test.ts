import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TRIGO_DRAFT_MAX,
  clearDraft,
  clearDraftFor,
  freshTurnKey,
  readDraft,
  writeDraft,
} from "./keys";

/** `Idempotency-Key` as the contract allows it. */
const API_KEY_SHAPE = /^[A-Za-z0-9_.:-]{16,128}$/;

beforeEach(() => {
  // The page-load copy is module state; each case starts with none.
  clearDraft();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("freshTurnKey", () => {
  it("is trg-web- and 24 letters or digits, which the API accepts", () => {
    const key = freshTurnKey();
    expect(key).toMatch(/^trg-web-[a-z0-9]{24}$/);
    expect(key).toMatch(API_KEY_SHAPE);
  });

  it("is new each time", () => {
    expect(freshTurnKey()).not.toBe(freshTurnKey());
  });
});

describe("writeDraft", () => {
  it("keeps the key while the text is the same", () => {
    const first = writeDraft("Beginner dive Saturday for two");
    const again = writeDraft("Beginner dive Saturday for two");
    expect(first).not.toBeNull();
    expect(again?.key).toBe(first?.key);
    expect(readDraft()).toEqual(first);
  });

  it("mints a new key when the text changes", () => {
    const first = writeDraft("Beginner dive");
    const changed = writeDraft("Beginner dive Saturday");
    expect(changed?.key).not.toBe(first?.key);
    expect(changed?.key).toMatch(API_KEY_SHAPE);
    expect(readDraft()?.text).toBe("Beginner dive Saturday");
  });

  it("mints a new key when the text goes back to an older one", () => {
    const first = writeDraft("Sunset on the water");
    writeDraft("Sunset on the water?");
    const back = writeDraft("Sunset on the water");
    expect(back?.key).not.toBe(first?.key);
  });

  it("cuts text past the contract's limit, so the key never stands for text the API refuses", () => {
    const draft = writeDraft("a".repeat(TRIGO_DRAFT_MAX + 20));
    expect(draft?.text).toHaveLength(TRIGO_DRAFT_MAX);
  });

  it("clears on empty text", () => {
    writeDraft("What should I bring?");
    expect(writeDraft("")).toBeNull();
    expect(readDraft()).toBeNull();
  });
});

describe("clearDraft", () => {
  it("forgets the text and its key", () => {
    const first = writeDraft("Is it good for kids?");
    clearDraft();
    expect(readDraft()).toBeNull();
    const next = writeDraft("Is it good for kids?");
    expect(next?.key).not.toBe(first?.key);
  });
});

describe("readDraft", () => {
  it("reads nothing from a value that is not a draft", () => {
    sessionStorage.setItem("yuvoy.trigo.draft", "{not json");
    expect(readDraft()).toBeNull();
    sessionStorage.setItem(
      "yuvoy.trigo.draft",
      JSON.stringify({ text: "Hi", key: "someone-elses-key" }),
    );
    expect(readDraft()).toBeNull();
  });
});

describe("when sessionStorage throws", () => {
  beforeEach(() => {
    const broken = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(broken);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(broken);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(broken);
  });

  it("still returns a draft, with a key that holds while the text is the same", () => {
    const first = writeDraft("Free things this weekend");
    expect(first?.text).toBe("Free things this weekend");
    expect(first?.key).toMatch(API_KEY_SHAPE);
    expect(writeDraft("Free things this weekend")?.key).toBe(first?.key);
    expect(writeDraft("Free things today")?.key).not.toBe(first?.key);
  });

  it("reads null and clears without throwing", () => {
    writeDraft("Something calm with my parents");
    expect(readDraft()).toBeNull();
    expect(() => clearDraft()).not.toThrow();
  });

  it("clearDraftFor the sent key forgets this page load's copy, so the same text gets a new key", () => {
    const key = writeDraft("Beginner dive Saturday for two")?.key ?? "";
    expect(key).toMatch(API_KEY_SHAPE);
    clearDraftFor(key);
    expect(writeDraft("Beginner dive Saturday for two")?.key).not.toBe(key);
  });

  it("clearDraftFor an older key keeps what was typed since", () => {
    const typed = writeDraft("Free things today");
    clearDraftFor("trg-web-somethingelseentirely00");
    expect(writeDraft("Free things today")?.key).toBe(typed?.key);
  });
});
