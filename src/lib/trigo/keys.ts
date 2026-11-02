/**
 * The message being typed to Trigo, and the key it goes with (yuvoy-app#223,
 * R5-T5).
 *
 * ## One key per message typed
 *
 * `POST /trigo/turns` needs an `Idempotency-Key`. A retry with the same key
 * returns the stored turn, so a send that timed out on a bad connection can
 * be sent again without Trigo answering twice or the day's count going down
 * twice. The same key with other text is `409 idempotency_key_reuse`, so the
 * key changes the moment the text does, and only then.
 *
 * ## Kept in sessionStorage, not localStorage
 *
 * A reload keeps the text and its key, so "Try again" after a reload is still
 * the same message. A key that outlived the tab would be sent days later with
 * the same text and come back as an old answer, which is why the web spec puts
 * both in sessionStorage (and why localStorage is an eslint error here).
 * Storage can throw (private mode, a full quota, a blocked frame), so every
 * read and write is in try/catch and a failure only means the draft is not
 * kept.
 */

/** The contract's limit on `TrigoTurnInput.text`. */
export const TRIGO_DRAFT_MAX = 1000;

const STORE_KEY = "yuvoy.trigo.draft";
const PREFIX = "trg-web-";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export interface TrigoDraft {
  text: string;
  key: string;
}

/** A key the API accepts: 16 to 128 of A-Za-z0-9_.:- , prefix "trg-web-". */
export function freshTurnKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `${PREFIX}${suffix}`;
}

function isDraft(value: unknown): value is TrigoDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.text === "string" &&
    v.text.length > 0 &&
    typeof v.key === "string" &&
    v.key.startsWith(PREFIX)
  );
}

/**
 * The draft of this page load, for when storage throws. Without it a tab whose
 * storage is blocked would mint a new key on every keystroke, and a retry of
 * the same text would be a second message.
 */
let inMemory: TrigoDraft | null = null;

/** The unsent text and its key, from sessionStorage (try/catch, null on any failure). */
export function readDraft(): TrigoDraft | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? { text: parsed.text, key: parsed.key } : null;
  } catch {
    return null;
  }
}

/**
 * The stored draft, or this page load's when storage holds none (it threw on
 * the read, or on the write before it, as a full quota does).
 */
function currentDraft(): TrigoDraft | null {
  return readDraft() ?? inMemory;
}

/**
 * Keeps the key when the text is unchanged, mints a new one when it changed.
 * Empty text clears. Returns the stored draft.
 *
 * Text past `TRIGO_DRAFT_MAX` is cut to it, so a key never stands for text the
 * API would refuse.
 *
 * When storage throws, the draft is still returned and kept for this page
 * load, so a send can go ahead with a steady key: it is only not kept for a
 * reload.
 */
export function writeDraft(text: string): TrigoDraft | null {
  const cut = text.slice(0, TRIGO_DRAFT_MAX);
  if (cut.length === 0) {
    clearDraft();
    return null;
  }
  const had = currentDraft();
  const draft: TrigoDraft =
    had && had.text === cut ? had : { text: cut, key: freshTurnKey() };
  inMemory = draft;
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(draft));
  } catch {
    // Not kept for a reload; the send itself still has its key.
  }
  return draft;
}

/** After a 200 answer for that key. */
export function clearDraft(): void {
  inMemory = null;
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing kept, so nothing to clear.
  }
}

/**
 * After a 200 answer for that key: clears the draft only when it is still the
 * one that was sent, read from storage or, when storage throws, from this
 * page load's copy. Text typed since keeps its own key.
 */
export function clearDraftFor(key: string): void {
  if (currentDraft()?.key === key) clearDraft();
}
