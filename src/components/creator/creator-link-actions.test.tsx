import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatorLinkActions } from "./creator-link-actions";
import type { CreatorLink } from "@/lib/creator/creator-words";

const LINK: CreatorLink = {
  code: "C-K7QM2XPA",
  link: "https://app.yuvoy.in/go/C-K7QM2XPA",
  target: {
    kind: "experience",
    id: "8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52",
    slug: "snorkel-elephant-beach",
    title: "Snorkel trip to Elephant Beach",
  },
  createdAt: "2026-10-21T04:00:00Z",
  opens30Days: 4,
  opensTotal: 12,
  bookings: 2,
};

const TEXT =
  "I went on Snorkel trip to Elephant Beach with Yuvoy. Have a look: https://app.yuvoy.in/go/C-K7QM2XPA";

afterEach(cleanup);

/*
  Only the two properties are replaced, never the whole `navigator`, and only
  AFTER `userEvent.setup()`, which installs its own clipboard. The reasons are
  in `link-actions.test.tsx`, which paid for both.
*/
function patchNavigator(props: {
  writeText?: (text: string) => Promise<void>;
  share?: ((data: ShareData) => Promise<void>) | undefined;
}) {
  const writeText = props.writeText ?? vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: props.share,
    configurable: true,
    writable: true,
  });
  return writeText;
}

/**
 * Copy link and Share for one share link (yuvoy-app#207, case 2 of
 * yuvoy-mobile#389): both give the `link` value as sent, and the share text
 * has the title.
 */
describe("a share link's two buttons", () => {
  it("copies the link exactly as the API sent it", async () => {
    const user = userEvent.setup();
    const writeText = patchNavigator({ share: undefined });
    render(<CreatorLinkActions link={LINK} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK.link));
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("claims nothing when the clipboard refuses", async () => {
    const user = userEvent.setup();
    patchNavigator({
      share: undefined,
      writeText: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    });
    render(<CreatorLinkActions link={LINK} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "This browser did not let us copy. Try again.",
    );
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("hands the sentence, with the title and the link, to the share sheet", async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    const writeText = patchNavigator({ share });
    render(<CreatorLinkActions link={LINK} />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: TEXT }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("is drawn where there is no share sheet, and copies the sentence instead", async () => {
    // Most desktop browsers. The issue: "copies otherwise".
    const user = userEvent.setup();
    const writeText = patchNavigator({ share: undefined });
    render(<CreatorLinkActions link={LINK} />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Message copied. Paste it where you want to send it.",
    );
  });

  it("copies nothing when the share sheet is dismissed", async () => {
    // A decision, not a failure: nothing goes behind the traveller's back.
    const user = userEvent.setup();
    const writeText = patchNavigator({
      share: vi.fn(async () => {
        throw new DOMException("Share canceled", "AbortError");
      }),
    });
    render(<CreatorLinkActions link={LINK} />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("copies the sentence when the share sheet refuses for another reason", async () => {
    const user = userEvent.setup();
    const writeText = patchNavigator({
      share: vi.fn(async () => {
        throw new DOMException("Not allowed", "NotAllowedError");
      }),
    });
    render(<CreatorLinkActions link={LINK} />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
  });

  it("never prints the address", () => {
    patchNavigator({ share: undefined });
    render(<CreatorLinkActions link={LINK} />);
    expect(document.body.textContent).not.toContain("/go/");
  });
});
