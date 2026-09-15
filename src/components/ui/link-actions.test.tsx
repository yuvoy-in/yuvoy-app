import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkActions } from "./link-actions";

/**
 * A link a traveller can pass on, without the link being on the screen.
 *
 * The property worth defending is the negative one: yuvoy-app#38 item 8 says
 * "never print the URL itself", and a booking's status token can CANCEL the
 * booking. So the first test is that the address does not appear as text, and
 * it is the one that would catch somebody adding it back "just for debugging".
 */

const URL_ = "https://app.yuvoy.in/i/inv_abc123";

afterEach(cleanup);

/*
  Only the two properties are replaced, never the whole `navigator`.

  Two traps here, both of which cost a debugging pass.

  Swapping the object wholesale is the obvious move and it hangs the suite:
  `userEvent.setup()` reads several things off the real navigator, and a
  spread copy loses what lives on its prototype, so every interaction waits
  forever. Defining the two properties leaves the rest of the object alone.

  And this must be called AFTER `userEvent.setup()`, never before.
  `user-event` installs its own clipboard stub on setup, so a stub written
  first is simply replaced and the spy never sees the call.
*/
function patchNavigator(props: {
  writeText?: () => Promise<void>;
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

const withClipboard = (writeText?: () => Promise<void>) =>
  patchNavigator({ writeText, share: undefined });

describe("LinkActions", () => {
  it("never prints the address", async () => {
    withClipboard();
    render(<LinkActions url={URL_} />);
    expect(screen.queryByText(URL_)).toBeNull();
    expect(document.body.textContent).not.toContain("inv_abc123");
  });

  it("copies on tap, and says so, then goes back", async () => {
    /*
      Real timers, deliberately. Fake ones have to be installed before
      `userEvent.setup` and torn down after every path out of the test,
      including a failing assertion, and a `useRealTimers` that a failure skips
      leaves every later test in the file hanging on a clock nobody advances.
      That cost a debugging pass here. Two seconds of real waiting is cheaper
      than a suite that fails in a way that does not point at itself.
    */
    const user = userEvent.setup();
    const writeText = withClipboard();

    render(<LinkActions url={URL_} />);
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_));
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();

    /*
      And back. A label that stays changed stops being feedback and becomes a
      wrong label, and a second copy would get no acknowledgement at all.
    */
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Copy link" }),
        ).toBeInTheDocument(),
      { timeout: 4000 },
    );
  }, 10_000);

  it("claims nothing when the clipboard refuses", async () => {
    /*
      No permission, no secure context, or a browser wanting a gesture it did
      not see. Saying "Copied" over an empty clipboard sends somebody to paste
      a link they do not have.
    */
    const user = userEvent.setup();
    withClipboard(
      vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    );

    render(<LinkActions url={URL_} />);
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    await new Promise((r) => setTimeout(r, 20));
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("hides Share where the browser has none", async () => {
    // Most desktop browsers. A button that does nothing is worse than none.
    withClipboard();
    render(<LinkActions url={URL_} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("hands the URL to the system where there is one", async () => {
    const share = vi.fn(async () => {});
    const user = userEvent.setup();
    patchNavigator({ share });

    render(<LinkActions url={URL_} title="Our trip" />);
    const button = await screen.findByRole("button", { name: "Share" });
    await user.click(button);

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ url: URL_, title: "Our trip" }),
    );
  });

  it("says nothing when the share sheet is dismissed", async () => {
    /*
      Dismissing is a decision, not a failure. An error panel for it would
      scold somebody for changing their mind, and Copy is still on screen.
    */
    const user = userEvent.setup();
    patchNavigator({
      share: vi.fn(async () => {
        throw new Error("AbortError");
      }),
    });

    render(<LinkActions url={URL_} />);
    await user.click(await screen.findByRole("button", { name: "Share" }));

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
  });
});
