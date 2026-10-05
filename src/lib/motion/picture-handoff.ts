/**
 * The picture a traveller tapped, handed to the listing it opens (T03 B,
 * approved 4 Oct 2026, with the integration change it needs: "the listing
 * gallery opening on the tapped picture").
 *
 * A saved card shows one picture. The listing's gallery may hold it anywhere,
 * not only first, and the picture can only fly into the hero if the hero IS
 * that picture when the listing arrives. So the card hands its picture over
 * as the link is followed, and the gallery opens on it.
 *
 * In memory and for one navigation only: it is read by the gallery that
 * mounts next, and anything older than a few seconds is a tap that never
 * became a screen (a failed navigation, a modifier click) and is ignored. It
 * is never written on the server, so a page rendered there, and the first
 * render of a hydrating one, always open on the first frame.
 */

/** Long enough for a slow listing to arrive, short enough to mean this tap. */
const FRESH_MS = 10_000;

let handed: { mediaId: string; at: number } | null = null;

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** Called by the card as its link is followed. */
export function handOffPicture(mediaId: string): void {
  handed = { mediaId, at: now() };
}

/**
 * The picture handed over, if it is recent and one of `mediaIds`; null
 * otherwise. Reading does not consume it (React may render twice); the
 * gallery calls {@link clearPicture} once it has opened.
 */
export function pictureHandedOff(mediaIds: readonly string[]): string | null {
  if (!handed || now() - handed.at > FRESH_MS) return null;
  return mediaIds.includes(handed.mediaId) ? handed.mediaId : null;
}

export function clearPicture(): void {
  handed = null;
}
