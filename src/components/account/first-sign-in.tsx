"use client";

import { useState } from "react";
import { YuvoyError } from "@/lib/api/errors";
import {
  useInterestOptions,
  useUpdateMyAccount,
  type AccountPatch,
} from "@/lib/auth/use-my-account";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/chrome/screen";
import { Skeleton } from "@/components/states";
import { InterestTiles } from "./interest-tiles";

/**
 * The first-sign-in screen (yuvoy-app#38 item 10).
 *
 * ## It is never a gate, and the contract says so twice
 *
 * "**It is never a gate.** Show the screen, let it be dismissed, and never put
 * it in front of a booking in progress." The issue repeats it under "Do not
 * build": "Onboarding as a gate on anything."
 *
 * So this renders on Account and nowhere else. Signing in from the Login
 * button, from checkout or from an invite lands the traveller where they were
 * going; `onboardingRequired` stays true and this appears the next time they
 * open Account. That is the whole of "never shown during checkout, the Ask
 * pop-up or an invite": the screen simply is not mounted anywhere else.
 *
 * ## Skip is a real answer, not a dismissal
 *
 * "The skip button is `{"onboarded": true}` on its own." A client-side
 * dismissal would bring the screen back on the next device, and on the next
 * visit, because the server would still say it was required.
 *
 * ## Continue does not send `onboarded`
 *
 * It does not need to: "Saving a name also marks the screen answered, so the
 * screen does not come back if `onboarded` is forgotten." Sending both would
 * be two statements of one fact, and the shorter one is the contract's own
 * documented behaviour.
 */
export function FirstSignIn({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [tried, setTried] = useState(false);

  const options = useInterestOptions(true);
  const save = useUpdateMyAccount();

  const details =
    save.error instanceof YuvoyError &&
    save.error.details &&
    typeof save.error.details === "object"
      ? (save.error.details as Record<string, string>)
      : {};

  const trimmedName = name.trim();

  function complete() {
    setTried(true);
    if (!trimmedName) return;
    const patch: AccountPatch = { name: trimmedName };
    if (email.trim()) patch.email = email.trim();
    if (interests.length) patch.interests = interests;
    save.mutate(patch, { onSuccess: () => onDone?.() });
  }

  function skip() {
    save.mutate({ onboarded: true }, { onSuccess: () => onDone?.() });
  }

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Welcome to Yuvoy
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        Two questions, once. You can skip them and nothing stops working.
      </p>

      <Field
        label="Your name"
        value={name}
        maxLength={80}
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
        error={
          details.name ??
          (tried && !trimmedName ? "We need a name to continue." : undefined)
        }
        className="mt-8"
      />

      <Field
        label="Email (optional)"
        type="email"
        value={email}
        maxLength={254}
        autoComplete="email"
        hint="For a receipt. We message you on WhatsApp either way."
        onChange={(e) => setEmail(e.target.value)}
        error={details.email}
        className="mt-5"
      />

      <div className="mt-8">
        <p className="label text-forest/75">What do you like?</p>
        {options.isPending ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-28" />
          </div>
        ) : options.isError ? (
          /*
            Silent about the failure beyond one line. This screen is optional
            in its entirety, so a broken list must not look like a broken
            sign-in to somebody who has just proved their number.
          */
          <p className="text-forest/70 mt-2 text-sm">
            We could not load these just now. You can set them later under
            Account.
          </p>
        ) : (
          <InterestTiles
            options={options.data?.options ?? []}
            chosen={interests}
            onChange={setInterests}
            className="mt-2"
          />
        )}
        {details.interests ? (
          <p role="alert" className="text-terra-deep mt-2 text-sm">
            {details.interests}
          </p>
        ) : null}
      </div>

      {save.error && Object.keys(details).length === 0 ? (
        <p role="alert" className="text-terra-deep mt-6 text-sm">
          {save.error instanceof YuvoyError
            ? save.error.message
            : "That did not save. Try again."}
        </p>
      ) : null}

      <Button
        block
        size="lg"
        disabled={save.isPending}
        onClick={complete}
        className="mt-8"
      >
        {save.isPending ? "Saving…" : "Continue"}
      </Button>

      <Button
        variant="ghost"
        block
        disabled={save.isPending}
        onClick={skip}
        className="mt-3"
      >
        Skip
      </Button>
    </Screen>
  );
}
