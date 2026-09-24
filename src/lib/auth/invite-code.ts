/**
 * Invite codes, as a person types them (yuvoy-api#195).
 *
 * The contract: "8 characters from an alphabet with no 0, O, 1, I or L, shown
 * as `XXXX-XXXX`. Case, spaces and hyphens do not matter on input, so
 * `k7qm 4xrd` is the same code as `K7QM-4XRD`."
 *
 * ## Checked here before anything is sent
 *
 * Redeeming is throttled: ten attempts an hour per number, and a limit per
 * connection on top. A typo that cannot be a code would spend one of those
 * ten, and on an island connection it would also spend a round trip, to learn
 * something this file can say at once and more precisely: which character is
 * wrong, or how many are missing.
 *
 * ## Tolerant of what people actually type and paste
 *
 * Lowercase, spaces, the hyphen, and also any other dash (a phone that turns
 * `--` into a long one, a message app that renders the hyphen as a non-breaking
 * one), the invisible characters a paste can carry, and full-width letters
 * from a CJK keyboard, which Unicode compatibility folding turns into plain
 * ones. None of those is a different code.
 */

export const INVITE_CODE_LENGTH = 8;

/** Written the way the code is shown, and the form's hint quotes it. */
export const INVITE_CODE_EXAMPLE = "K7QM-4XRD";

/**
 * Not part of the code: whitespace, every dash Unicode has (`\p{Pd}`, which
 * includes the ASCII hyphen), and the invisible format characters a paste
 * brings along (`\p{Cf}`: the zero-width space and joiners, the word joiner,
 * a byte-order mark, a soft hyphen). Named by class rather than listed, so no
 * long dash or invisible character has to be written into this file.
 */
const SEPARATORS = /[\s\p{Pd}\p{Cf}]/gu;

/** The five characters a code never uses, and a misread code usually has. */
const LOOKALIKES = /[0O1IL]/;

/** The whole alphabet: A to Z without I, L and O, then 2 to 9. */
const ALPHABET = /^[A-HJKMNP-Z2-9]+$/;

/** `k7qm 4xrd` becomes `K7QM4XRD`. Nothing is dropped that could be a mistake. */
export function normaliseInviteCode(input: string): string {
  return input.normalize("NFKC").replace(SEPARATORS, "").toUpperCase();
}

/**
 * Why what was typed cannot be a code, or `null` when it can.
 *
 * Checked in the order that gives the most useful sentence: a character that
 * is not a letter or a number, then one of the five a code never uses, then
 * the length. "It has 7 characters" is no help to somebody whose problem is an
 * O that should have been a Q.
 */
export type InviteCodeProblem =
  | { kind: "empty" }
  | { kind: "characters" }
  | { kind: "lookalikes" }
  | { kind: "length"; length: number };

export function inviteCodeProblem(input: string): InviteCodeProblem | null {
  const code = normaliseInviteCode(input);
  if (code.length === 0) return { kind: "empty" };
  if (/[^A-Z0-9]/.test(code)) return { kind: "characters" };
  if (LOOKALIKES.test(code)) return { kind: "lookalikes" };
  if (code.length !== INVITE_CODE_LENGTH) {
    return { kind: "length", length: code.length };
  }
  return null;
}

/** Whether this is a well-formed code, whatever it was typed with. */
export function isInviteCode(input: string): boolean {
  const code = normaliseInviteCode(input);
  return code.length === INVITE_CODE_LENGTH && ALPHABET.test(code);
}

/**
 * `k7qm4xrd` as `K7QM-4XRD`, the way codes are shown.
 *
 * Only a well-formed code is regrouped. Anything else comes back as typed,
 * so a field is never rewritten into something the person did not type.
 */
export function formatInviteCode(input: string): string {
  if (!isInviteCode(input)) return input;
  const code = normaliseInviteCode(input);
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What to say about a code that cannot be one. */
export function inviteCodeProblemSentence(problem: InviteCodeProblem): string {
  switch (problem.kind) {
    case "empty":
      return "Enter the code you were given.";
    case "characters":
      return "That cannot be a code. Codes are letters and numbers only.";
    case "lookalikes":
      return "That cannot be a code. Codes never use the letters O, I or L, or the numbers 0 or 1, so check those against the code you were given.";
    case "length":
      return `That cannot be a code. A code is ${INVITE_CODE_LENGTH} letters and numbers, like ${INVITE_CODE_EXAMPLE}, and that has ${problem.length}.`;
  }
}
