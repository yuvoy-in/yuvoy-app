import { useEffect, type RefObject } from "react";
import type { ReelWatch } from "@/lib/feed/use-reel-views";

/** A media-time step larger than this is a jump, not playback. */
const MAX_STEP_S = 2;
/** Within this of the end is the end, for `timeupdate`'s quarter-second grain. */
const END_SLACK_S = 0.35;

/**
 * `FeedPlayer`'s clock for a reel view. Moved out of `feed-player.tsx` as it
 * was (yuvoy-app#243). The ref is the player's own, and stable.
 */
export function useFeedPlayerWatch(
  videoRef: RefObject<HTMLVideoElement | null>,
  watch: ReelWatch | undefined,
  hasClip: boolean,
): void {
  /*
    HOW MUCH OF THE CLIP ACTUALLY PLAYED, for a reel view (yuvoy-app#96).

    Read from the element's own clock, not from a timer beside it: a clip that
    is buffering, paused or refused is on screen and not playing, and the API
    asks for the time it PLAYED. Each `timeupdate` (four or so a second) adds
    the media time that passed since the last one, while the element is not
    paused.

    `loop` means the clip never reports `ended`: it comes round to the start
    and carries on. That shows up as the media time going BACKWARDS, and is
    both the rest of the last pass (up to `duration`) plus the start of this
    one, and the evidence it played to its end. A frame within `END_SLACK_S`
    of the end counts as the end too, for the traveller who scrolls on just as
    it gets there. A jump of more than `MAX_STEP_S` is not playback (a source
    attaching, a stall recovering), so it is not counted.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !watch) return;

    let last: number | null = null;
    const finite = (n: number) => Number.isFinite(n) && n > 0;

    const sample = () => {
      const now = video.currentTime;
      const duration = video.duration;
      if (last !== null && !video.paused) {
        const step = now - last;
        if (step > 0 && step <= MAX_STEP_S) {
          watch.played(step * 1000);
        } else if (step < 0 && finite(duration)) {
          const lap = duration - last + now;
          if (lap > 0 && lap <= MAX_STEP_S) watch.played(lap * 1000);
          watch.completed();
        }
      }
      if (finite(duration) && now >= duration - END_SLACK_S) watch.completed();
      last = now;
    };
    // Resuming after a pause or a stall measures from where it resumed.
    const resume = () => {
      last = video.currentTime;
    };
    const ended = () => {
      sample();
      watch.completed();
    };

    video.addEventListener("timeupdate", sample);
    video.addEventListener("playing", resume);
    video.addEventListener("ended", ended);
    return () => {
      video.removeEventListener("timeupdate", sample);
      video.removeEventListener("playing", resume);
      video.removeEventListener("ended", ended);
    };
  }, [videoRef, watch, hasClip]);
}
