/**
 * Sharing a URL from a phone, then from everywhere else.
 *
 * Native share where it exists — on a phone that is what people expect, and
 * it avoids a clipboard permission prompt. A dismissed share sheet is a
 * decision, not a failure, so nothing is copied behind the traveller's back.
 * Where there is no share sheet the address goes to the clipboard, and where
 * even that is refused the caller says so rather than pretending.
 */
export type ShareOutcome = "shared" | "dismissed" | "copied" | "unavailable";

export async function shareUrl(input: {
  title: string;
  url: string;
}): Promise<ShareOutcome> {
  if (typeof navigator === "undefined") return "unavailable";

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(input);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "dismissed";
      }
      // NotAllowedError, an unsupported payload, a desktop browser that
      // exposes the API and then refuses it: fall through to copying.
    }
  }

  try {
    await navigator.clipboard.writeText(input.url);
    return "copied";
  } catch {
    return "unavailable";
  }
}
