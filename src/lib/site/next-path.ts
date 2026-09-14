/**
 * Where to send somebody after they sign in, when a `?next=` says so.
 *
 * ## This is an open-redirect guard, not a convenience
 *
 * The Login button carries the current page in `?next=`, so a traveller lands
 * back where they were (yuvoy-app#56). That parameter is attacker-controlled
 * by definition: anybody can send a link to
 * `app.yuvoy.in/account?next=https://evil.example/login`, and a traveller who
 * signs in on OUR domain, with our sign-in form, is then handed to somebody
 * else's page in the same tab, mid-flow, already trusting what they see. It is
 * the classic credential-phishing chain and the redirect is the only link in
 * it we control.
 *
 * So this is an allowlist of ONE shape: a path on this origin. Anything else
 * answers `null`, and #56 says what the caller does with that in as many
 * words: "otherwise stay on Account."
 *
 * ## Why the checks are what they are
 *
 * Every rule here is a real bypass rather than a hypothetical:
 *
 *   - **`//evil.example`** is protocol-relative. It starts with `/`, so a
 *     naive "must start with a slash" check passes it, and the browser reads
 *     it as an absolute URL to another host.
 *   - **`/\evil.example`** and `/\/evil.example` are the same trick with a
 *     backslash. WHATWG's URL parser treats `\` as `/` in the authority
 *     position, so several browsers navigate off-origin.
 *   - **`javascript:`** and `data:` never start with a slash, but they are
 *     worth naming: this refuses by allowlist, so they cannot arrive through
 *     some later relaxation of the first rule.
 *   - **Percent-encoding.** `%2f%2fevil.example` decodes to `//evil.example`.
 *     `next` arrives already decoded from `useSearchParams`, but a caller
 *     reading a raw query string would not, so the check is applied to the
 *     decoded form too rather than trusting one caller's habits.
 *   - **A newline or a tab** is stripped by browsers before parsing a URL, so
 *     `/\n/evil.example` can become `//evil.example`. Control characters are
 *     refused outright rather than sanitised, because sanitising invites the
 *     next encoding.
 *
 * The result is deliberately NOT normalised or re-encoded. Handing back the
 * caller's own string, unchanged, means what is checked is exactly what is
 * navigated to. A guard that rewrites its input is a guard you have to prove
 * twice.
 */

/** Anything a browser strips or folds before parsing. */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

/** A scheme, with optional whitespace a browser would ignore. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;

  const value = next.trim();
  if (value === "") return null;
  if (CONTROL.test(value)) return null;

  /*
    Checked in both forms. `useSearchParams` decodes once, so `value` is
    usually already plain; a caller reading `location.search` by hand is not,
    and `%2f%2f` would otherwise walk straight through the `//` test below.

    `decodeURIComponent` throws on a lone `%`, which is itself a refusal.
  */
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (CONTROL.test(decoded)) return null;

  for (const form of [value, decoded]) {
    if (!form.startsWith("/")) return null;
    // Protocol-relative, in both spellings a browser accepts.
    if (form.startsWith("//") || form.startsWith("/\\")) return null;
    if (SCHEME.test(form)) return null;
  }

  return value;
}

/** The current path and query, as the value a Login link should carry. */
export function nextParamFor(pathname: string, search: string): string {
  const query = search && search !== "?" ? search : "";
  return `${pathname}${query}`;
}
