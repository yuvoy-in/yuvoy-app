import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

/**
 * Attaching a clip to `FeedPlayer`'s `<video>`, and seeing its first frame.
 *
 * Moved out of `feed-player.tsx` as it was (yuvoy-app#243): the player keeps
 * the state and decides `canPlay`; this feeds the element once it may, and
 * lets it go again. The ref and the setters are the player's own, and stable,
 * so naming them in the effects' lists changes nothing about when they run.
 */
export function useFeedPlayerSource({
  videoRef,
  src,
  canPlay,
  setPlayable,
  setFailed,
  setFramedFor,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string | undefined;
  canPlay: boolean;
  setPlayable: Dispatch<SetStateAction<boolean>>;
  setFailed: Dispatch<SetStateAction<boolean>>;
  setFramedFor: Dispatch<SetStateAction<string | null>>;
}): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !canPlay) return;

    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const onNativeError = () => {
      if (!cancelled) setFailed(true);
    };

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

    void (async () => {
      try {
        if (nativeHls) {
          /*
            A clip that cannot play on the native path says so here, and
            nowhere else: a browser playing HLS itself (Safari, iOS, and now
            Chromium too) reports a dead manifest or segment only as the
            element's own `error`. With nothing listening, the card kept a
            play control and a sound toggle for a clip that could never play,
            or the slow ring spun over the poster for ever (motion audit
            3.10). Failed is a card with its poster and no clip, the same as
            hls.js's fatal error below.
          */
          video.addEventListener("error", onNativeError);
          video.src = src;
          setPlayable(true);
          return;
        }
        // Only reached where the browser cannot play HLS itself. Dynamic so
        // the bytes never load for the browsers that do not need them.
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setFailed(true);
          return;
        }
        const instance = new Hls({
          // Island connection: keep the buffer small so a stall recovers fast
          // rather than sitting on 30 seconds of stale segments.
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          // Keeps the rendition matched to a phone-sized element rather than
          // fetching a 1080p ladder for a 480px column.
          capLevelToPlayerSize: true,
        });
        hls = instance;
        /*
          A fatal decode fault is often one bad fragment, and hls.js's own
          answer is to rebuild the media buffer and carry on: tried once per
          attachment. It used to end the clip at once (stability audit,
          6 Oct 2026). A network fault is only fatal once hls.js has spent
          its own retries, and a second decode fault means the clip will not
          decode here, so both are a failure, which the card's next time on
          screen tries afresh.
        */
        let recovered = false;
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            instance.recoverMediaError();
            return;
          }
          setFailed(true);
        });
        instance.loadSource(src);
        instance.attachMedia(video);
        setPlayable(true);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      video.removeEventListener("error", onNativeError);
      hls?.destroy();
      /*
        Let go of the media, not only the listener. On the native path (all
        of iOS, Safari and now Chromium) an element that leaves the preload
        budget kept its source and its buffers until garbage collection, so
        a long session held a decoder per card it had passed. Emptying the
        source and loading nothing is how a media element is told to release
        them.

        And it is not playable any more: the element that comes back is a new
        one with nothing attached, and `play()` on it before the source is
        attached was refused, which drew a play control on a clip that was
        about to start by itself.
      */
      if (nativeHls) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      setPlayable(false);
    };
  }, [videoRef, src, canPlay, setPlayable, setFailed]);

  // The first decoded frame of this clip: from here it may be seen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    // A new element, or a new source on this one, always fires it.
    const framedNow = () => setFramedFor(src);
    video.addEventListener("loadeddata", framedNow);
    return () => video.removeEventListener("loadeddata", framedNow);
  }, [videoRef, src, canPlay, setFramedFor]);
}
