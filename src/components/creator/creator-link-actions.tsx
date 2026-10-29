"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon, ShareIcon } from "@/components/ui/icons";
import {
  CREATOR_WORDS as W,
  shareText,
  type CreatorLink,
} from "@/lib/creator/creator-words";

type Notice = "messageCopied" | "copyRefused" | null;

/**
 * Copy link and Share, for one share link (yuvoy-app#207).
 *
 * Both hand over `link` exactly as the API sent it: the full `/go/` address,
 * never one built here, so the code the API counts is the code that travels.
 *
 * ## Not `LinkActions`, and why
 *
 * `LinkActions` hides Share where the browser has no share sheet, and shares
 * a bare URL. Here Share is always drawn, as the issue asks: with a share
 * sheet it sends the sentence ("I went on ... Have a look: {link}"), and
 * without one that sentence goes to the clipboard and the line under the
 * buttons says so. A share sheet dismissed is a decision, not a failure, so
 * nothing is copied behind the traveller's back then.
 *
 * Always drawn also means nothing depends on the browser during render, so
 * the server and the first client render agree.
 *
 * Both buttons keep the names "Copy link" and "Share" and are described by
 * the title of what they share (`describedBy`), so a screen reader moving
 * through a list of them hears which link each one is for.
 */
export function CreatorLinkActions({
  link,
  describedBy,
  focusCopy = false,
  className,
}: {
  link: CreatorLink;
  /** The id of the element that names what is shared. */
  describedBy?: string;
  /**
   * Take the focus onto Copy link when drawn: for Get my link, whose button
   * these replace, so the focus is not dropped onto the page.
   */
  focusCopy?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const buttons = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusCopy) buttons.current?.querySelector("button")?.focus();
  }, [focusCopy]);

  /*
    "Copied" for two seconds, then back, and a line for four, each clock
    restarted by a second tap. Cleared on unmount so nothing lands on a gone
    component.
  */
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // No permission, no secure context, or no gesture seen. Nothing is
      // claimed: "Copied" over an empty clipboard sends nobody anything.
      return false;
    }
  }

  async function copyLink() {
    setNotice(null);
    // Back to "Copy link" first, so a second tap starts the two seconds again.
    setCopied(false);
    if (await copy(link.link)) setCopied(true);
    else setNotice("copyRefused");
  }

  async function share() {
    setNotice(null);
    const text = shareText(link);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Refused for another reason: copying is still a way to send it.
      }
    }
    setNotice((await copy(text)) ? "messageCopied" : "copyRefused");
  }

  return (
    <div className={className}>
      <div ref={buttons} className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-describedby={describedBy}
          onClick={() => void copyLink()}
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
          {copied ? W.copied : W.copy}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-describedby={describedBy}
          onClick={() => void share()}
        >
          <ShareIcon className="size-4" />
          {W.share}
        </Button>
      </div>
      {/*
        Always in the tree, so a sentence written into it is announced. Empty
        it takes no room.
      */}
      <p
        role="status"
        className="text-forest/70 mt-2 text-xs empty:mt-0"
        data-testid="creator-link-notice"
      >
        {notice ? W[notice] : ""}
      </p>
    </div>
  );
}
