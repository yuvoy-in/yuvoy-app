import { describe, expect, it } from "vitest";
import { onLinkRows, sentLinkRows } from "./organisers-links";

describe("a link's sentence on its own row", () => {
  it("puts the API's links.0 under row 1 when row 0 was blank and not sent", () => {
    const form = {
      links: [
        { kind: "website" as const, url: "  " },
        { kind: "other" as const, url: "https://blocked.example" },
      ],
    };
    const sent = sentLinkRows(form);
    expect(sent).toEqual([1]);
    expect(
      onLinkRows(
        { "links.0": "That site cannot be linked.", name: "Too short." },
        sent,
      ),
    ).toEqual({ "links.1": "That site cannot be linked.", name: "Too short." });
  });

  it("puts a link index that was never sent under the links as a whole", () => {
    expect(onLinkRows({ "links.2": "Not a link." }, [0])).toEqual({
      links: "Not a link.",
    });
  });
});
