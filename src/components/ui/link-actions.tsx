"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon, ShareIcon } from "@/components/ui/icons";

/**
 * A link a traveller can pass on, without printing the link.
 *
 * ## Why the URL is never on the screen (yuvoy-app#38 item 8)
 *
 * The booking page used to render its share URL in `font-mono break-all`, and
 * so did the invite. Three things are wrong with that, in rising order:
 *
 * A wrapped 90 character token is unreadable, and nobody retypes one, so it
 * occupies a paragraph to serve nobody.
 *
 * It teaches the shape of our credentials to anybody standing behind a
 * traveller on a jetty, and to any screenshot of the page.
 *
 * And it is the thing this product is most careful about: a booking's status
 * token can CANCEL the booking. A page that prints a URL trains people to
 * treat these as ordinary text to paste around.
 *
 * So the link is an action, not a string. Copy puts it on the clipboard and
 * Share hands it to the operating system.
 *
 * ## Share is hidden where it does not exist, and that needs a mount check
 *
 * `navigator.share` is absent on most desktop browsers, and a button that does
 * nothing is worse than no button. But the server has no `navigator` at all,
 * so deciding during render would mean the server drawing one thing and the
 * browser another: a hydration mismatch, which is the class of defect
 * yuvoy-app#67 shipped. The first render therefore matches the server, and the
 * button appears after mount.
 */
export function LinkActions({
  url,
  title,
  className,
}: {
  url: string;
  /** For the native sheet. Some targets show it, most ignore it. */
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const mounted = useHasMounted();
  const canShare =
    mounted && typeof navigator !== "undefined" && Boolean(navigator.share);

  /*
    "Copied" for two seconds, then back. A label that stays changed forever
    stops being feedback and becomes a wrong label, and somebody who copies a
    second time gets no acknowledgement at all.

    Cleared on unmount so a state update cannot land on a gone component, and
    keyed on `copied` so a second copy restarts the clock rather than
    inheriting the first one's remaining time.
  */
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                /*
                  Refused: no permission, no secure context, or a browser that
                  wants a user gesture it did not see. Nothing is claimed,
                  which is the point of not saying "Copied" optimistically.
                */
              }
            })();
          }}
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
          {copied ? "Copied" : "Copy link"}
        </Button>

        {canShare ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.share({ url, ...(title ? { title } : {}) });
                } catch {
                  // Dismissed, or the target refused. Neither is an error
                  // worth putting on the screen: Copy is still right there.
                }
              })();
            }}
          >
            <ShareIcon className="size-4" />
            Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** True after hydration. `useSyncExternalStore` is the honest way to ask. */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
