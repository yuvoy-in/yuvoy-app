import type { Metadata } from "next";

/**
 * Search-engine ownership verification, as a deployment setting.
 *
 * ## Why this is a hook and not a pasted tag
 *
 * Verifying a property in Search Console or Bing Webmaster Tools means proving
 * you control the host. One of the accepted proofs is a `<meta>` tag in the
 * document head — and the token in it is **per property**, so `yuvoy.in`,
 * `app.yuvoy.in` and a preview deployment each need a different one, and the
 * value would change again if this app ever took the root domain (D-102,
 * deferred). A literal in the layout would be wrong on at least one of those the
 * day it was written.
 *
 * So the value comes from the environment, and the repo carries the mechanism
 * rather than the secret-that-is-not-a-secret.
 *
 * ## Deliberately not `NEXT_PUBLIC_`
 *
 * The token is emitted into the HTML, so it is public by definition — but it
 * is read here, on the server, while metadata is generated. A `NEXT_PUBLIC_`
 * prefix would inline it into the client bundle for no reason, and it carries
 * a trap this project has already paid for: **a `NEXT_PUBLIC_` variable marked
 * Sensitive in Vercel reaches the build as the literal `[SENSITIVE]`**, which
 * killed three production deploys. These must NOT be marked Sensitive either
 * way; there is nothing to protect, and marking them would publish the string
 * `[SENSITIVE]` as the proof of ownership.
 *
 * ## Rendered even while the site is noindex, on purpose
 *
 * You verify a property *before* it is indexable — that is the whole point of
 * verifying: it is how the owner sees crawl and coverage problems before
 * launch rather than after. So this is independent of `INDEXABLE`, and a test
 * pins that, because "we turned indexing off, why did verification break" is
 * the kind of coupling somebody adds in good faith.
 */

/** Google Search Console, URL-prefix property. */
const GOOGLE_ENV = "GOOGLE_SITE_VERIFICATION";
/** Bing Webmaster Tools. Rendered as `msvalidate.01`. */
const BING_ENV = "BING_SITE_VERIFICATION";

/**
 * Describes a value without reproducing it.
 *
 * Same reasoning as the operator portal's `OPERATOR_API_URL` check: a build
 * log may redact the value, and shape survives redaction. A length and a
 * character census is enough to recognise a pasted tag or a stray quote.
 */
function describeShape(value: string): string {
  const unusual = [...new Set(value.replace(/[A-Za-z0-9_-]/g, ""))].join(" ");
  return (
    `length ${value.length}` +
    (unusual ? `, unexpected characters: [ ${unusual} ]` : "")
  );
}

export class VerificationTokenError extends Error {}

/**
 * The token, or `undefined` if this deployment sets none.
 *
 * **Absent is fine and silent** — most deployments (previews, local, the
 * operator portal) verify nothing. **Present and malformed throws**, because
 * the failure it prevents is invisible: a wrong token means the owner sits in
 * Search Console pressing Verify and being told no, with nothing anywhere
 * saying why. A build that stops and names the variable is the cheapest
 * possible place to find that out.
 *
 * The three mistakes worth naming are all the same mistake — copying more than
 * the value:
 *
 *   - the whole `<meta name="…" content="…" />` tag
 *   - the DNS TXT form, `google-site-verification=abc123`
 *   - the value with its quotes still attached
 */
export function readToken(
  name: string,
  raw: string | undefined,
): string | undefined {
  const trimmed = raw?.trim().replace(/^["']|["']$/g, "");
  // `??` does not catch an empty string, and an env var created in a dashboard
  // with no value is the easiest mistake there is to make.
  if (!trimmed) return undefined;

  if (/[<>]/.test(trimmed)) {
    throw new VerificationTokenError(
      `${name} looks like a whole HTML tag. Paste only the value of the ` +
        `content attribute, not the <meta …> element around it. ` +
        `(${describeShape(trimmed)})`,
    );
  }
  if (trimmed.includes("=")) {
    throw new VerificationTokenError(
      `${name} looks like the DNS TXT record form ` +
        `("google-site-verification=…"). That form belongs in DNS; this ` +
        `variable takes the meta-tag value on its own. ` +
        `(${describeShape(trimmed)})`,
    );
  }
  if (/\s/.test(trimmed)) {
    throw new VerificationTokenError(
      `${name} contains whitespace, so it is more than one value. ` +
        `(${describeShape(trimmed)})`,
    );
  }
  /*
    A character-set check rather than a length check.

    Both providers issue opaque tokens and neither documents the length as
    stable, so pinning one would fail the day a provider adds a character. The
    alphabet is what actually catches the paste mistakes above, and everything
    past that is the provider's to reject.
  */
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new VerificationTokenError(
      `${name} contains characters no verification token uses. ` +
        `(${describeShape(trimmed)})`,
    );
  }

  return trimmed;
}

/**
 * The `verification` block for the root layout, or `undefined`.
 *
 * `undefined` rather than an empty object: Next renders nothing for the
 * former, and an empty `verification: {}` is a silent no-op that reads in the
 * source like something is configured.
 */
export function verificationMeta(
  /*
    A plain record rather than `NodeJS.ProcessEnv`, which this project types as
    requiring `NODE_ENV` — so every test would have to supply one to pass two
    variables. This function reads exactly two keys and should not care what
    else the environment happens to hold.
  */
  env: Record<string, string | undefined> = process.env,
): Metadata["verification"] {
  const google = readToken(GOOGLE_ENV, env[GOOGLE_ENV]);
  const bing = readToken(BING_ENV, env[BING_ENV]);

  if (!google && !bing) return undefined;

  return {
    ...(google ? { google } : {}),
    // Next has no first-class Bing field; `other` emits an arbitrary
    // `<meta name>`, and `msvalidate.01` is the name Bing looks for.
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  };
}
