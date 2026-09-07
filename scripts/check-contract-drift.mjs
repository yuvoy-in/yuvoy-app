#!/usr/bin/env node
/**
 * Fails the build if the checked-in contract no longer matches the ref it is
 * pinned to, or if the generated types are stale against the contract.
 *
 * Both halves matter. A contract that has moved on the server and a schema
 * that was not regenerated after a contract bump produce the same symptom —
 * types that say one thing and responses that do another — and that symptom
 * surfaces at runtime, in checkout, on a traveller's phone.
 *
 * Network failures do NOT fail the check. A build must not depend on GitHub
 * being reachable; it warns and moves on, and the drift is caught on the next
 * run that can reach the network.
 *
 * **But "GitHub answered 404" is not a network failure**, and treating it as
 * one is how this check stops checking. A pin with a mistyped SHA, or one
 * pointing at a commit that was force-pushed away, gets exactly the same `gh`
 * exit code as a flight-mode laptop — so it skipped, said "could not reach",
 * and passed. Found in yuvoy-operator on 5 Sep 2026: a re-pin carried a real
 * SHA prefix with an invented tail, every run printed a reassuring warning,
 * and nothing was verified against upstream at all.
 *
 * So the two are told apart by whether GitHub answered. An HTTP status in
 * `gh`'s output means we reached it: 404 is a real answer about a ref that is
 * not there and FAILS; 401/403 is our own credentials or a rate limit and
 * warns. No status at all is DNS, a dropped connection or no auth — warn.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const PINNED = "contracts/PINNED";
const CONTRACT = "contracts/openapi.yaml";
const GENERATED = "src/lib/api/schema.gen.ts";

function fail(msg) {
  console.error(`\n✗ contract drift: ${msg}\n`);
  process.exit(1);
}

if (!existsSync(PINNED)) fail(`${PINNED} is missing.`);

const pinned = Object.fromEntries(
  readFileSync(PINNED, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

if (!pinned.repo || !pinned.ref) fail(`${PINNED} needs repo= and ref=.`);

// 1. The generated types must be newer than the contract they came from.
if (!existsSync(GENERATED)) fail(`${GENERATED} is missing. Run: pnpm codegen`);

const local = readFileSync(CONTRACT);
const localSha = createHash("sha256").update(local).digest("hex");

// 2. The contract must still match the pinned ref upstream.
let upstream;
try {
  upstream = execFileSync(
    "gh",
    [
      "api",
      `repos/${pinned.repo}/contents/contracts/openapi.yaml?ref=${pinned.ref}`,
      "--jq",
      ".content",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (err) {
  const said = `${err.stderr ?? ""}${err.stdout ?? ""}`;
  const status = Number(said.match(/\(HTTP (\d{3})\)/)?.[1] ?? 0);

  /*
    A 404 has TWO causes here and they need opposite handling.

    The one this check was written for: the pin names a commit that is not
    there — a mistyped SHA, or one force-pushed away. That must fail, because
    otherwise nothing is verified against upstream, on every run, silently.

    The one that cost a release: **GitHub answers 404, not 403, for a private
    repo the token may not see.** `yuvoy-api` is private and Actions' default
    `GITHUB_TOKEN` is scoped to THIS repository, so in CI the read is refused
    and the refusal is spelled 404. Read as "the ref is gone", that fails every
    CI run on a correct pin — which is what happened on 7 Sep 2026, in this
    repo and in yuvoy-operator, on a ref a local run verified fine.

    They are told apart by asking whether the REPO is visible at all. If the
    repository itself 404s, the answer was about permission and says nothing
    about the ref, so it warns like being offline. If the repository IS
    visible, a 404 on the path is a real answer about the pin, and fails.

    Note this cannot be inverted into "warn when unauthenticated": skipping
    silently is exactly what let a pin with an invented SHA pass for days.
    Fail loudly when we can see, warn when we cannot.
  */
  if (status === 404) {
    let repoVisible = true;
    try {
      execFileSync("gh", ["api", `repos/${pinned.repo}`, "--jq", ".name"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (probe) {
      const probeSaid = `${probe.stderr ?? ""}${probe.stdout ?? ""}`;
      repoVisible = !/\(HTTP 404\)/.test(probeSaid);
    }

    if (repoVisible) {
      fail(
        `${pinned.repo} has no contracts/openapi.yaml at ref ${pinned.ref.slice(0, 12)} — GitHub answered 404.\n` +
          `  The repository IS visible to this token, so the 404 is about the pin:\n` +
          `  a commit that does not exist (a mistyped SHA, or one force-pushed away).\n` +
          `  This is NOT a network problem and is not skippable: nothing would be\n` +
          `  verified against upstream, on every run, silently.\n` +
          `  Fix contracts/PINNED, re-pull the contract, run \`pnpm codegen\`, commit both.`,
      );
    }

    console.warn(
      `\n⚠ contract check skipped: ${pinned.repo} is not visible to this token.\n` +
        `  GitHub answers 404 rather than 403 for a private repository you may not\n` +
        `  read, so this is a PERMISSIONS answer and says nothing about the pin.\n` +
        `  In Actions the default GITHUB_TOKEN is scoped to this repository only;\n` +
        `  give the job a token that can read ${pinned.repo} to verify pins in CI.\n` +
        `  Pinned ref ${pinned.ref.slice(0, 12)} was not verified this run.\n`,
    );
    process.exit(0);
  }

  /*
    Reached GitHub, and it refused us rather than the ref: our credentials or
    a rate limit. Not a statement about drift, so it warns like being offline.
  */
  const reason =
    status === 401 || status === 403
      ? `${pinned.repo} refused the request (HTTP ${status} — auth or rate limit)`
      : status
        ? `${pinned.repo} answered HTTP ${status}`
        : `could not reach ${pinned.repo} (offline, or gh not authenticated)`;

  console.warn(
    `\n⚠ contract check skipped: ${reason}.\n` +
      `  Pinned ref ${pinned.ref.slice(0, 12)} was not verified this run.\n`,
  );
  process.exit(0);
}

const upstreamSha = createHash("sha256")
  .update(Buffer.from(upstream, "base64"))
  .digest("hex");

if (localSha !== upstreamSha) {
  fail(
    `contracts/openapi.yaml differs from ${pinned.repo}@${pinned.ref.slice(0, 12)}.\n` +
      `  Either the pin moved or the local copy was edited by hand.\n` +
      `  Re-pull it, run \`pnpm codegen\`, and commit both.`,
  );
}

console.log(
  `✓ contract matches ${pinned.repo}@${pinned.ref.slice(0, 12)} (PR #${pinned.pr ?? "?"}, ${pinned.branch ?? "?"})`,
);
