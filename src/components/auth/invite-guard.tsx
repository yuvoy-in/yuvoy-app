"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet } from "@/components/ui/sheet";
import { INVITE_ONLY, type Standing } from "@/lib/site/access";
import { ensureStanding, useStanding } from "@/lib/auth/use-access";
import { InviteGate, gateTitle, type GateView } from "./invite-gate";

/**
 * The gate over a page that is already open: saving, asked for by a visitor
 * who is not in (yuvoy-api#195).
 *
 * Four of the five gated routes cannot reach this, because the server never
 * renders them for somebody who is not admitted. The two that can are the
 * open ones: a SHARED reel (`/r/{id}`) and a business's reel
 * (`/o/{slug}/r/{id}`). Both stay open on purpose, because they are links
 * somebody sent, and both carry the same card as the feed, with its Save
 * control on it. Without this, that control would write a save the gate is
 * supposed to be asking about.
 *
 * ## Nothing exists with the switch off
 *
 * `INVITE_ONLY` is inlined at build time, so a deployment with the gate off
 * compiles this to its children: no sheet, no context state, no `GET /me`,
 * and every Save is the tap it always was. That is the rule for the whole
 * feature, and it is why the stateful half is a separate component rather
 * than a branch inside one.
 *
 * ## A tap is never dropped, and never refused before it is known
 *
 * The answer is usually already here: with the switch on, `useStanding` is
 * enabled on every page, so the session and `GET /me` are in flight from the
 * first paint. When it is not here yet the sheet opens on `checking` and
 * `ensureStanding` fetches the same two reads through the same query
 * definitions, so a tap in the first moment of a page is answered rather than
 * dropped or guessed at.
 *
 * An `unknown` standing (a `GET /me` this device could not make) SAVES. It is
 * the same failing-open the server side takes: saving is a posture, the one
 * thing that must be refused is a booking, and the API refuses that itself.
 */

/** Whether this standing may save without being asked for an invitation. */
function maySave(standing: Standing | undefined): boolean {
  return standing === "admitted" || standing === "unknown";
}

/** The gate's view for a standing. `undefined` is not known YET, never a no. */
function viewFor(standing: Standing | undefined): GateView {
  if (standing === undefined) return "checking";
  if (standing === "signed-out") return "signed-out";
  if (standing === "not-admitted") return "code";
  return "in";
}

/**
 * Runs `save`, or opens the gate and holds it until the visitor is in.
 *
 * The default runs it at once. That is what every caller gets with the switch
 * off, and it is also the honest answer for a tree with no provider above it
 * (a unit test rendering one card), because with no gate there is nothing to
 * ask.
 */
const InviteGuardContext = createContext<(save: () => void) => void>((save) =>
  save(),
);

export function useSaveGate(): (save: () => void) => void {
  return useContext(InviteGuardContext);
}

export function InviteGuard({ children }: { children: ReactNode }) {
  if (!INVITE_ONLY) return children;
  return <GuardedTree>{children}</GuardedTree>;
}

function GuardedTree({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  /**
   * A code that has just been accepted, for as long as this sheet is open.
   *
   * The redeem answers before `GET /me` has been read again, and a read that
   * has not caught up would put the code form back under somebody who has
   * just typed a code that worked. So the answer wins over the read, and only
   * until the sheet closes: by the next tap the invalidated read has landed,
   * and a latch that outlived the sheet would speak for whoever signs in
   * next.
   */
  const [justAdmitted, setJustAdmitted] = useState(false);
  /**
   * The save that opened the sheet, run when the visitor is in.
   *
   * A ref rather than state: it is never rendered, and it has to be readable
   * from a handler that fires long after the tap.
   */
  const pending = useRef<(() => void) | null>(null);

  /*
    The page's own read of where this device stands, already in flight on
    every page while the switch is on, and the one source of truth here.

    It follows a sign-in made inside the sheet on its own: signing in flips
    the session read, `GET /me` goes out, and `useStanding` answers
    `undefined` until it lands, which the sheet draws as checking rather than
    as a refusal. Derived, never mirrored into state in an effect: that is a
    second copy to keep in step, and a render for every answer that already
    rendered once.
  */
  const live = useStanding(true);
  const standing: Standing | undefined = justAdmitted ? "admitted" : live;

  const close = useCallback(() => {
    pending.current = null;
    setJustAdmitted(false);
    setOpen(false);
  }, []);

  /** In: close, and do the thing that was asked for. */
  const proceed = useCallback(() => {
    const save = pending.current;
    pending.current = null;
    setJustAdmitted(false);
    setOpen(false);
    save?.();
  }, []);

  const ask = useCallback(
    (save: () => void) => {
      // Known to be in: saved, with no sheet and no flash.
      if (maySave(live)) {
        save();
        return;
      }
      pending.current = save;
      setOpen(true);
      /*
        The same two reads, through the same query definitions, so the answer
        lands in the cache `live` is reading: the sheet follows it without
        being told twice.
      */
      void ensureStanding(qc).then((answer) => {
        if (maySave(answer)) proceed();
      });
    },
    [live, qc, proceed],
  );

  const view = viewFor(standing);

  return (
    <InviteGuardContext value={ask}>
      {children}
      {/*
        Mounted only while it is open. The sheet is a `<dialog>`, and a closed
        one on every page is a focus trap waiting to be opened by something
        else; it also costs the sign-in steps' state on every reel.
      */}
      {open ? (
        <Sheet open onClose={close} title={gateTitle(view, "sheet")}>
          <InviteGate
            view={view}
            variant="sheet"
            purpose="save"
            /*
              Nothing to do after a sign-in: the session read flips, `GET /me`
              goes out, and `standing` is `undefined` until it answers, which
              is the checking frame rather than the number field again.

              Admitted is not a question at all. The API has just said so, so
              the screen goes from the code to "You are in" with no frame of
              checking in between.
            */
            onAdmitted={() => setJustAdmitted(true)}
            onContinue={proceed}
          />
        </Sheet>
      ) : null}
    </InviteGuardContext>
  );
}
