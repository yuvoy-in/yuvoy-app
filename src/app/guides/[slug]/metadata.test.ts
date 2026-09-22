import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * A published guide carries the app's robots policy, SAID, not inherited.
 *
 * It used to return `robots: undefined` for a published guide, on the reading
 * that an undefined key inherits the layout's value. Next merges a segment's
 * metadata key by key, `for (const key in metadata)`, and an own key whose
 * value is `undefined` is still a key: it resolved to `null` and replaced the
 * layout's `robotsMeta`. Every live guide rendered no robots tag at all, and
 * so none of the `max-image-preview` and `max-snippet` directives the default
 * exists to carry on the pages most likely to be found by a search.
 *
 * The page is rendered by nothing here: `generateMetadata` is a function, and
 * what it returns is the whole of the defect.
 */

// The body of the page is MDX, which none of this reaches.
vi.mock("next-mdx-remote/rsc", () => ({ MDXRemote: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("@/lib/guides/guides");
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("a guide's robots policy", () => {
  it("is the app default on a published guide, never absent", async () => {
    const { generateMetadata } = await import("./page");
    const { robotsMeta } = await import("@/lib/site/indexing");
    const { publishedGuides } = await import("@/lib/guides/guides");

    const [guide] = publishedGuides();
    expect(guide, "the content folder has no published guide").toBeDefined();

    const metadata = await generateMetadata(params(guide.slug));
    // An own key set to `undefined` is what took the tag away: pin both.
    expect(metadata.robots).toBeDefined();
    expect(metadata.robots).toEqual(robotsMeta);
  });

  it("carries the preview directives once indexing is switched on", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", "true");
    vi.resetModules();
    const { generateMetadata } = await import("./page");
    const { publishedGuides } = await import("@/lib/guides/guides");

    const [guide] = publishedGuides();
    const metadata = await generateMetadata(params(guide.slug));

    expect(metadata.robots).toMatchObject({
      index: true,
      follow: true,
      googleBot: {
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    });
  });

  it("stays never-indexed for a guide that is not published, whatever the switch", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", "true");
    vi.resetModules();
    const real = await vi.importActual<typeof import("@/lib/guides/guides")>(
      "@/lib/guides/guides",
    );
    const [published] = real.publishedGuides();
    vi.doMock("@/lib/guides/guides", () => ({
      ...real,
      getGuide: () => ({ ...published, status: "review" }),
    }));

    const { generateMetadata } = await import("./page");
    const { unpublishedRobotsMeta } = await import("@/lib/site/indexing");
    const metadata = await generateMetadata(params(published.slug));

    expect(metadata.robots).toEqual(unpublishedRobotsMeta);
  });
});
