import { describe, expect, it } from "vitest";
import { businessEntries } from "./business-sitemap";

/*
  yuvoy-app#116 item 5. The sitemap carried no business at all, because the
  catalog index enumerates none. They are read off the listings on sale,
  each once.
*/

const listing = (slug: string, operator: string) =>
  ({ slug, operator: { slug: operator } }) as never;

const NOW = new Date("2026-10-03T00:00:00Z");

describe("businessEntries", () => {
  it("lists each business once, at its newest listing's date", () => {
    const entries = businessEntries(
      [
        listing("dive", "blue-dunghi"),
        listing("kayak", "blue-dunghi"),
        listing("walk", "reef-walkers"),
      ],
      new Map([
        ["dive", new Date("2026-09-20T00:00:00Z")],
        ["kayak", new Date("2026-09-24T00:00:00Z")],
      ]),
      "https://app.yuvoy.in",
      NOW,
    );

    expect(entries).toEqual([
      {
        url: "https://app.yuvoy.in/o/blue-dunghi",
        lastModified: new Date("2026-09-24T00:00:00Z"),
        changeFrequency: "weekly",
        priority: 0.7,
      },
      {
        url: "https://app.yuvoy.in/o/reef-walkers",
        lastModified: NOW,
        changeFrequency: "weekly",
        priority: 0.7,
      },
    ]);
  });

  it("leaves out a listing that names no business", () => {
    expect(
      businessEntries(
        [{ slug: "x", operator: { slug: "  " } } as never],
        new Map(),
        "https://app.yuvoy.in",
        NOW,
      ),
    ).toEqual([]);
  });
});
