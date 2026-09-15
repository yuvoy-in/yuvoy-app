"use client";

import { useState } from "react";
import { YuvoyError } from "@/lib/api/errors";
import {
  useInterestOptions,
  useUpdateMyAccount,
  type AccountPatch,
  type TravellerAccount,
} from "@/lib/auth/use-my-account";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/states";
import { InterestTiles } from "./interest-tiles";

/**
 * Edit profile (yuvoy-app#38 item 9).
 *
 * ## Only what changed is sent, and that is the contract's rule not a saving
 *
 * "Send only the fields that change: an absent field is left alone,
 * `email: null` or `email: ""` removes the email, and `interests: []` clears
 * the interests."
 *
 * So a diff, not a form dump. Sending every field every time would mean a
 * traveller who opened this sheet to fix a typo in their name also rewrote
 * their interests with whatever the tiles happened to be showing, and a
 * `GET /me` that had not landed yet would rewrite them as empty.
 *
 * ## The name is the only required field, and only on a first save
 *
 * "Any other first save needs a `name`." The API owns that rule; this form
 * refuses an empty name outright because the field is on screen either way and
 * a round trip to be told so is a round trip on island signal.
 */
export function EditProfileSheet({
  account,
  onClose,
}: {
  account: TravellerAccount;
  onClose: () => void;
}) {
  const [name, setName] = useState(account.name ?? "");
  const [email, setEmail] = useState(account.email ?? "");
  const [interests, setInterests] = useState<string[]>(account.interests ?? []);
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
  const nameMissing = trimmedName.length === 0;

  function submit() {
    setTried(true);
    if (nameMissing) return;

    const patch: AccountPatch = {};
    if (trimmedName !== (account.name ?? "")) patch.name = trimmedName;

    /*
      An empty box means "remove it", which the contract spells `null` or `""`.
      Compared against the account's own value so clearing an email that was
      already absent sends nothing at all rather than a pointless removal.
    */
    const trimmedEmail = email.trim();
    if (trimmedEmail !== (account.email ?? "")) {
      patch.email = trimmedEmail === "" ? null : trimmedEmail;
    }

    // Order is meaningful, so this compares the sequence rather than the set.
    const before = account.interests ?? [];
    if (
      interests.length !== before.length ||
      interests.some((key, i) => key !== before[i])
    ) {
      patch.interests = interests;
    }

    /*
      Nothing changed. Closing without a request is the honest outcome: a
      no-op PATCH would still cost a round trip and could still fail, which
      would report a problem with a change nobody made.
    */
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    save.mutate(patch, { onSuccess: onClose });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit profile"
      footer={
        <Button block disabled={save.isPending} onClick={submit}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <Field
        label="Your name"
        value={name}
        maxLength={80}
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
        error={
          details.name ?? (tried && nameMissing ? "We need a name." : undefined)
        }
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

      <div className="mt-6">
        <p className="label text-forest/75">What do you like?</p>
        {options.isPending ? (
          <div className="mt-2 flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        ) : options.isError ? (
          /*
            The list is an enhancement to a form that saves without it. A
            failure here must not block a name change, so it says what is
            missing and the rest of the sheet still works.
          */
          <p className="text-forest/70 mt-2 text-sm">
            We could not load the interests just now. Your name and email still
            save.
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
        <p role="alert" className="text-terra-deep mt-4 text-sm">
          {save.error instanceof YuvoyError
            ? save.error.message
            : "That did not save. Try again."}
        </p>
      ) : null}
    </Sheet>
  );
}
