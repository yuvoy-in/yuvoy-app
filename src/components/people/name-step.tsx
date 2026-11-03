"use client";

import { useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateMyAccount } from "@/lib/auth/use-my-account";
import { qk } from "@/lib/query/policy";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Refusal } from "./people-parts";

const W = PEOPLE_WORDS.name;

/**
 * The name step before People opens (yuvoy-app#222): `needsName`, or a
 * `409 name_required`. The first name goes to `PATCH /me`, then the home is
 * read again so `needsName` is the API's answer, not a guess.
 */
export function NameStep({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateMyAccount();
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);
  const titleId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setMissing(true);
      return;
    }
    update.mutate(
      { name: trimmed },
      {
        onSuccess: async () => {
          await qc.invalidateQueries({ queryKey: qk.myPeople() });
          onDone?.();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={titleId}>
      <h1
        id={titleId}
        className="font-display tracking-display leading-display text-3xl text-balance"
      >
        {W.title}
      </h1>
      <p className="text-forest/70 text-body mt-3 text-pretty">{W.body}</p>
      <Field
        className="mt-6"
        label={W.field}
        error={missing ? W.missing : undefined}
        autoComplete="given-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (missing) setMissing(false);
        }}
      />
      {update.error ? <Refusal error={update.error} className="mt-4" /> : null}
      <Button
        type="submit"
        size="lg"
        className="mt-6"
        pending={update.isPending}
        pendingLabel={W.saving}
      >
        {W.action}
      </Button>
    </form>
  );
}
