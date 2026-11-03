import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

/**
 * `FeedPlayer`'s play and pause, and whether its clip is actually running.
 *
 * Moved out of `feed-player.tsx` as it was (yuvoy-app#243). The ref and the
 * setters are the player's own, and stable, so naming them in the effects'
 * lists changes nothing about when they run.
 */
export function useFeedPlayerPlayback({
  videoRef,
  active,
  playable,
  mayPlay,
  asked,
  userPaused,
  canPlay,
  setRejectedFor,
  setPlaying,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  playable: boolean;
  mayPlay: boolean;
  asked: boolean;
  userPaused: boolean;
  canPlay: boolean;
  setRejectedFor: Dispatch<SetStateAction<"auto" | "asked" | null>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
}): void {
  /*
    Play/pause follows the active card. Never autoplay off-screen.

    `asked` joins `autoplayAllowed` here so a tap starts playback on a card the
    connection heuristic had refused. The gesture is not needed for the play
    itself — the feed is muted by default and muted playback needs no gesture
    in any browser — which is why setting state and letting this effect do the
    work is safe. Unmuting is the only thing that requires one, and that is
    already behind its own tap.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playable) return;
    if (active && mayPlay && !userPaused) {
      // Captured at the moment of the attempt, so a refusal is filed against
      // the try that earned it and not against whatever is current when the
      // promise settles.
      const forAttempt = asked ? "asked" : "auto";
      void video.play().then(
        () => setRejectedFor(null),
        (error: unknown) => {
          /*
            Refused by the browser is a normal outcome, not an error, but it
            IS the moment there is something for a traveller to do, and the
            only moment. Recording it here is what lets the control stay away
            while a clip is merely still buffering (#78).

            And only a refusal: `NotAllowedError`, the autoplay policy saying
            no. Leaving the card pauses it, which rejects a `play()` still
            pending with an `AbortError`; recording that drew the play control
            over a clip that was only starting when the traveller flicked back
            to it (6 Oct 2026).
          */
          if ((error as { name?: unknown } | null)?.name === "NotAllowedError")
            setRejectedFor(forAttempt);
        },
      );
    } else {
      video.pause();
    }
  }, [videoRef, active, playable, mayPlay, asked, userPaused, setRejectedFor]);

  /*
    Whether it is actually running, read from the element rather than assumed.

    `play()` resolving is not the same as playing — a stall, a policy refusal
    or a source error all leave the promise settled and the picture still. The
    play control keys off this, so it must be the truth.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    /*
      `waiting` is the clip stopping for data; `stalled` is not a stop at all.
      It fires when the network has been quiet for about three seconds, which
      is normal with a full buffer, and reading it as stopped drew "Loading
      video" over a clip that was playing on Safari. A real rebuffer mid-clip,
      meanwhile, froze the picture with no ring, because nothing listened for
      `waiting` (6 Oct 2026).
    */
    video.addEventListener("playing", on);
    video.addEventListener("pause", off);
    video.addEventListener("ended", off);
    video.addEventListener("waiting", off);
    return () => {
      video.removeEventListener("playing", on);
      video.removeEventListener("pause", off);
      video.removeEventListener("ended", off);
      video.removeEventListener("waiting", off);
    };
  }, [videoRef, canPlay, setPlaying]);
}
