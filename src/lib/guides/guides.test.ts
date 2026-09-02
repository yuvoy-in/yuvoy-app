import { describe, it, expect } from "vitest";
import { guideFrontmatter, assertPublishable, type Guide } from "./schema";

/**
 * The review gate.
 *
 * A guide is a published claim about the Andamans under Yuvoy's name. This
 * project removed a site for publishing invented prices and unapproved
 * operator names, so the rule here is that nothing reaches the index without a
 * source — and it fails the BUILD rather than rendering half-formed.
 */

const base = {
  title: "Diving in Havelock, and what to expect",
  description:
    "Where the dive sites are, what a first dive actually involves, and the questions worth asking an operator before you book.",
  status: "draft" as const,
  updated: "2026-08-31",
};

describe("guide frontmatter", () => {
  it("accepts a well-formed record", () => {
    expect(guideFrontmatter.safeParse(base).success).toBe(true);
  });

  it("accepts an unquoted YAML date, which parses as a Date", () => {
    // The failure that caught this: `updated: 2026-08-31` with no quotes is a
    // Date, with quotes is a string. Correct frontmatter either way.
    const parsed = guideFrontmatter.safeParse({
      ...base,
      updated: new Date("2026-08-31T00:00:00Z"),
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.updated).toBe("2026-08-31");
  });

  it("rejects a description that would be truncated in search results", () => {
    expect(
      guideFrontmatter.safeParse({ ...base, description: "Too short." })
        .success,
    ).toBe(false);
    expect(
      guideFrontmatter.safeParse({ ...base, description: "x".repeat(200) })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown status, so a typo cannot publish a draft", () => {
    expect(
      guideFrontmatter.safeParse({ ...base, status: "live" }).success,
    ).toBe(false);
  });
});

describe("assertPublishable", () => {
  const guide = (over: Partial<Guide> = {}): Guide => ({
    ...base,
    slug: "x",
    body: "",
    ...over,
  });

  it("refuses to publish a guide that cites nothing", () => {
    expect(() => assertPublishable(guide({ status: "published" }))).toThrow(
      /cites no sources/,
    );
  });

  it("allows a published guide with sources", () => {
    expect(() =>
      assertPublishable(
        guide({ status: "published", sources: ["Andaman tourism department"] }),
      ),
    ).not.toThrow();
  });

  it("leaves drafts alone — they are meant to be unfinished", () => {
    expect(() => assertPublishable(guide({ status: "draft" }))).not.toThrow();
  });
});

/* ------------------------------------------------------------------ hero -- */

describe("the lead image, and what it may not ship without", () => {
  const base = {
    slug: "x",
    title: "A guide about something",
    description:
      "A description long enough to satisfy the schema's own lower bound on it.",
    status: "published" as const,
    updated: "2026-09-02",
    sources: ["Somewhere checkable"],
    body: "",
  };

  it("publishes without an image at all", () => {
    // A guide with no photograph is a guide, not a failure.
    expect(() => assertPublishable(base)).not.toThrow();
  });

  it("refuses alt text that names the file instead of describing it", () => {
    /*
      The schema's ten-character floor catches "img". This catches "guide
      image", which clears the floor and says nothing. Alt text is read aloud
      to somebody who cannot see the photograph — "image" tells them only that
      they are missing something.
    */
    for (const alt of ["guide image", "Placeholder", "PHOTO", "banner"]) {
      expect(() =>
        assertPublishable({
          ...base,
          hero: { src: "/media/g.jpg", alt, credit: "Yuvoy" },
        }),
      ).toThrow(/placeholder alt text/);
    }
  });

  it("accepts alt text that describes the picture", () => {
    expect(() =>
      assertPublishable({
        ...base,
        hero: {
          src: "/media/g.jpg",
          alt: "A dive boat tied up at Havelock jetty at first light",
          credit: "Shot by Yuvoy, Havelock, August 2026",
        },
      }),
    ).not.toThrow();
  });

  it("refuses a hero that is not actually in public/", () => {
    /*
      A missing image renders as nothing, so a broken hero is invisible in
      review and obvious to a traveller. Caught at build, where it is
      somebody's job to fix.
    */
    const exists = (p: string) => p === "/media/real.jpg";
    expect(() =>
      assertPublishable(
        {
          ...base,
          hero: {
            src: "/media/missing.jpg",
            alt: "A dive boat at the jetty at first light",
            credit: "Yuvoy",
          },
        },
        exists,
      ),
    ).toThrow(/not in public\//);
    expect(() =>
      assertPublishable(
        {
          ...base,
          hero: {
            src: "/media/real.jpg",
            alt: "A dive boat at the jetty at first light",
            credit: "Yuvoy",
          },
        },
        exists,
      ),
    ).not.toThrow();
  });

  it("does not hold a draft to any of it", () => {
    // Drafts exist to be read while they are still wrong.
    expect(() =>
      assertPublishable(
        {
          ...base,
          status: "draft",
          sources: undefined,
          hero: { src: "/nope.jpg", alt: "image", credit: "?" },
        },
        () => false,
      ),
    ).not.toThrow();
  });
});
