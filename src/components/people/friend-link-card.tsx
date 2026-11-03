"use client";

import { useState } from "react";
import { useDeleteFriendLink, usePutFriendLink } from "@/lib/people/use-people";
import {
  PEOPLE_WORDS as W,
  inviteText,
  linkLife,
  type FriendLink,
} from "@/lib/people/people-words";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Refusal, isStepRefusal } from "./people-parts";

type Invited = "copied" | "refused" | null;

/**
 * The invite, as the issue words it: the Web Share sheet where the browser
 * has one, otherwise the message is copied. A dismissed sheet is a decision,
 * so nothing is copied behind it; a sheet that refuses falls through to
 * copying. Yuvoy sends nothing.
 */
async function invite(text: string): Promise<Invited> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ text });
      return null;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "refused";
  }
}

/**
 * "Your friend link" on People (yuvoy-app#222): the link and how long it
 * lasts, the invite, a new link and switching it off. `onStep` takes a
 * refusal that asks for the age or name step first.
 */
export function FriendLinkCard({
  link,
  onStep,
}: {
  link: FriendLink | null;
  onStep: (error: unknown) => void;
}) {
  const put = usePutFriendLink();
  const off = useDeleteFriendLink();
  const [invited, setInvited] = useState<Invited>(null);
  const [switchedOff, setSwitchedOff] = useState(false);

  const onError = (error: unknown) => {
    if (isStepRefusal(error)) onStep(error);
  };
  const make = (rotate: boolean) => {
    off.reset();
    setInvited(null);
    put.mutate(rotate, { onError, onSuccess: () => setSwitchedOff(false) });
  };
  const failure = [put.error, off.error].find((e) => e && !isStepRefusal(e));

  return (
    <section aria-labelledby="friend-link" className="mt-10">
      <h2
        id="friend-link"
        className="label text-forest/75 border-paper-line border-b pb-2"
      >
        {W.linkTitle}
      </h2>
      <p className="text-forest/70 text-body mt-3 text-pretty">{W.linkIntro}</p>

      {link ? (
        <Panel className="mt-3">
          <p className="font-mono text-sm break-all">{link.url}</p>
          <p className="text-forest/70 mt-1 text-sm tabular-nums">
            {linkLife(link)}
          </p>
          <Button
            className="mt-4"
            block
            onClick={() => {
              setInvited(null);
              void invite(inviteText(link)).then(setInvited);
            }}
          >
            {W.invite}
          </Button>
          <p role="status" className="text-forest/70 mt-2 text-sm">
            {invited === "copied" ? W.messageCopied : ""}
          </p>
          {invited === "refused" ? (
            <p role="alert" className="text-terra-deep text-sm">
              {W.copyRefused}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              aria-describedby="new-link-note"
              pending={put.isPending}
              pendingLabel={W.makingLink}
              onClick={() => make(true)}
            >
              {W.newLink}
            </Button>
            <Button
              variant="outline"
              size="sm"
              pending={off.isPending}
              pendingLabel={W.switchingOff}
              onClick={() => {
                put.reset();
                setInvited(null);
                off.mutate(undefined, {
                  onSuccess: () => setSwitchedOff(true),
                });
              }}
            >
              {W.switchOff}
            </Button>
          </div>
          <p id="new-link-note" className="text-forest/70 mt-2 text-xs">
            {W.newLinkNote}
          </p>
        </Panel>
      ) : (
        <div className="mt-3">
          <p role="status" className="text-forest/70 text-sm">
            {switchedOff ? W.linkOff : W.noLink}
          </p>
          <Button
            className="mt-3"
            pending={put.isPending}
            pendingLabel={W.makingLink}
            onClick={() => make(false)}
          >
            {W.getLink}
          </Button>
        </div>
      )}

      {failure ? <Refusal error={failure} className="mt-3" /> : null}
    </section>
  );
}
