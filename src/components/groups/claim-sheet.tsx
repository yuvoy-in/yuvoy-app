"use client";

import { useId, useRef, useState } from "react";
import { CLAIM_WORDS, type ClaimField } from "@/lib/groups/club-words";
import {
  claimBody,
  claimMissing,
  clubFailure,
  type ClaimForm,
} from "@/lib/groups/clubs";
import { useClaimClub } from "@/lib/groups/use-clubs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FormGone, FormLine, FormSent } from "./form-parts";

const W = CLAIM_WORDS;
const EMPTY: ClaimForm = {
  roleText: "",
  contactEmail: "",
  proofUrl: "",
  note: "",
};

/**
 * Claim it (yuvoy-mobile#386), for a signed-in traveller who runs the group.
 * The page offers it only while the group is not on Yuvoy, and sends a
 * signed-out reader to sign in first.
 *
 * The two required fields left empty are asked for on each before anything
 * is sent. One claim goes however often Send claim is pressed. The answer:
 *   - 202: the API's message, and Done;
 *   - 404: People closed, or the group is not there (read again): that line
 *     as an alert, never a receipt, and its one button goes back to the
 *     directory (`onLeave`);
 *   - a 400 naming a field: said on that field;
 *   - 403 `adult_confirmation_required`, 409 `name_required`, 403
 *     `people_paused`: said in words (the web has no age or name step yet),
 *     and Send claim stays held;
 *   - 409 waiting or already claimed, 429: the API's message, and Send claim
 *     stays held. Already claimed reads the group again (`onClaimed`);
 *   - anything else: a line, with what was typed kept, to send again.
 */
export function ClaimSheet({
  clubId,
  name,
  onClose,
  onLeave,
  onClaimed,
}: {
  clubId: string;
  name: string;
  onClose: () => void;
  onLeave: () => void;
  onClaimed: () => void;
}) {
  const claim = useClaimClub(clubId);
  const noteId = useId();
  const [form, setForm] = useState<ClaimForm>(EMPTY);
  const [fields, setFields] = useState<Partial<Record<ClaimField, string>>>(
    {},
  );
  const [line, setLine] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  // Set in the same moment as the press: a second press finds it held.
  const busy = useRef(false);
  const done = useRef(false);

  const typed = (key: ClaimField) => (text: string) => {
    setForm((was) => ({ ...was, [key]: text }));
    setFields((was) => {
      const rest = { ...was };
      delete rest[key];
      return rest;
    });
  };

  const send = async () => {
    if (busy.current || done.current || held) return;
    const missing = claimMissing(form);
    if (Object.keys(missing).length > 0) {
      setFields(missing);
      return;
    }
    busy.current = true;
    setLine(null);
    setFields({});
    try {
      const receipt = await claim.mutateAsync(claimBody(form));
      done.current = true;
      setSent(receipt.message);
    } catch (error) {
      const why = clubFailure("claim", error);
      switch (why.kind) {
        case "closed":
        case "gone":
          done.current = true;
          setGone(why.line);
          return;
        case "fields":
          setFields(why.fields);
          return;
        case "claimed":
          onClaimed();
          setLine(why.line);
          setHeld(true);
          return;
        case "age":
        case "name":
        case "paused":
        case "waiting":
        case "limit":
          setLine(why.line);
          setHeld(true);
          return;
        default:
          setLine(why.line);
      }
    } finally {
      busy.current = false;
    }
  };

  if (gone !== null) return <FormGone line={gone} onLeave={onLeave} />;

  if (sent !== null) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={W.title(name)}
        footer={
          <Button block onClick={onClose}>
            {W.done}
          </Button>
        }
      >
        <FormSent text={sent} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={W.title(name)}
      footer={
        <Button
          block
          pending={claim.isPending}
          pendingLabel={W.sending}
          disabled={held}
          onClick={() => void send()}
        >
          {W.send}
        </Button>
      }
    >
      <p className="text-body text-forest/70 text-pretty">{W.intro}</p>

      <div className="mt-5 flex flex-col gap-4">
        <Field
          label={W.roleText}
          value={form.roleText}
          onChange={(e) => typed("roleText")(e.target.value)}
          maxLength={80}
          autoComplete="organization-title"
          error={fields.roleText}
        />
        <Field
          label={W.contactEmail}
          type="email"
          value={form.contactEmail}
          onChange={(e) => typed("contactEmail")(e.target.value)}
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          error={fields.contactEmail}
        />
        <Field
          label={W.proofUrl}
          type="url"
          value={form.proofUrl}
          onChange={(e) => typed("proofUrl")(e.target.value)}
          maxLength={500}
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          error={fields.proofUrl}
        />
        <label className="block">
          <span className="label text-forest/75">{W.note}</span>
          <Textarea
            value={form.note}
            onChange={(e) => typed("note")(e.target.value)}
            rows={3}
            maxLength={500}
            aria-invalid={fields.note ? true : undefined}
            aria-describedby={fields.note ? noteId : undefined}
            className="rounded-control border-paper-line bg-paper focus:border-forest/60 ease-interaction mt-2 w-full border px-4 py-3 text-base transition-colors duration-200 outline-none"
          />
        </label>
        {fields.note ? (
          <p id={noteId} role="alert" className="text-terra-deep -mt-2 text-sm">
            {fields.note}
          </p>
        ) : null}
      </div>

      <FormLine text={line} />
    </Sheet>
  );
}
