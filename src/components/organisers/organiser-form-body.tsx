"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
  ORGANISER_ABOUT_MAX,
  ORGANISER_MAX_DEPARTMENTS,
  ORGANISER_NAME_MAX,
  organiserInput,
  type OrganiserPageForm,
} from "@/lib/organisers/organisers";
import { clubOrganiserInput } from "@/lib/organisers/organisers-club";
import { onLinkRows, sentLinkRows } from "@/lib/organisers/organisers-links";
import {
  organiserRefusal,
  type OrganiserRefusal,
} from "@/lib/organisers/refusal";
import type { Organiser } from "@/lib/organisers/types";
import {
  useCreateOrganiser,
  useUpdateOrganiser,
} from "@/lib/organisers/use-organisers";
import {
  ORGANISER_DEPARTMENTS,
  ORGANISER_WORDS as W,
} from "@/lib/organisers/words";
import { qk } from "@/lib/query/policy";
import { useVocabulary } from "@/lib/search/use-search-reels";
import { usePlaceList } from "@/lib/site/use-place";
import { clubOfferChanged } from "./organiser-club-parts";
import { OrganiserWriteError } from "./organiser-gate";
import {
  DepartmentPicker,
  FieldLine,
  FixedPage,
  OrganiserLinks,
  type FixedFields,
  PlacePicker,
  handOverLinked,
  missing,
  placeName,
  withoutKey,
} from "./organiser-form-parts";

/**
 * The page form itself, for a new page, a group's page and an edit (what each
 * one is: `organiser-form.tsx`). Split out of `organiser-form.tsx` to keep it
 * short.
 */

export function OrganiserFormBody({
  start,
  id,
  clubId,
  fixed,
}: {
  start: OrganiserPageForm;
  id?: string;
  /** Set up from this group (`createOrganiser` with `clubId`). */
  clubId?: string;
  /** The group's name and place, for a group's page. */
  fixed?: FixedFields;
}) {
  const editing = id !== undefined;
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateOrganiser();
  const update = useUpdateOrganiser(id ?? "");
  const write = editing ? update : create;
  const places = usePlaceList({ initial: null, signedIn: true, enabled: true });
  const vocabulary = useVocabulary();
  const aboutId = useId();
  const runsItId = useId();

  const [form, setForm] = useState<OrganiserPageForm>(start);
  // An edit is the owner's page already: the line was ticked when it was set up.
  const [runsIt, setRunsIt] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<OrganiserRefusal | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof OrganiserPageForm>(
    key: K,
    value: OrganiserPageForm[K],
  ) => {
    setForm((was) => ({ ...was, [key]: value }));
    setErrors((was) => withoutKey(was, key));
    setSaved(false);
  };

  const offered: { key: string; label: string }[] =
    vocabulary.data?.categories ??
    Object.entries(ORGANISER_DEPARTMENTS).map(([key, label]) => ({
      key,
      label,
    }));
  // A ticked one the vocabulary leaves out is still sent, so it stays on screen to untick.
  const departments = [
    ...offered,
    ...form.departments
      .filter((key) => !offered.some((department) => department.key === key))
      .map((key) => ({ key, label: W.departmentLabel(key) })),
  ];

  const done = (organiser: Organiser) => {
    if (editing) {
      setSaved(true);
      return;
    }
    const made = clubId === undefined ? "1" : "club";
    router.replace(
      `/organiser/${encodeURIComponent(organiser.id)}?made=${made}`,
    );
  };

  const failed = (error: unknown, sent: readonly number[]) => {
    const said = organiserRefusal(error);
    if (said.kind === "clubLinked") {
      // The group has its organiser already: that page opens, with the API's sentence.
      void qc.invalidateQueries({ queryKey: qk.myOrganisers() });
      setRefusal(said);
      handOverLinked(said.organiserId, said.message);
      router.replace(`/organiser/${encodeURIComponent(said.organiserId)}`);
      return;
    }
    // The API numbers `links.N` over the links sent; the rows on screen include blank ones.
    if (said.kind === "fields") setErrors(onLinkRows(said.fields, sent));
    if (
      (said.kind === "network" && !editing) ||
      (clubId !== undefined && clubOfferChanged(error))
    ) {
      // No answer: it may have been made, so the list is read again and nothing is sent by itself.
      // A group no longer to offer: the list is read again so the hub stops offering it.
      void qc.invalidateQueries({ queryKey: qk.myOrganisers() });
    }
    setRefusal(said);
  };

  const send = () => {
    if (write.isPending) return;
    setRefusal(null);
    setSaved(false);
    const found = missing(form, runsIt, fixed !== undefined);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setRefusal({ kind: "fields", fields: found, message: W.checkFields });
      return;
    }
    // A group's body (create and edit) sends the links in these same rows.
    const sent = sentLinkRows(form);
    const answer = {
      onSuccess: done,
      onError: (error: unknown) => failed(error, sent),
    };
    if (editing) {
      // A group's organiser sends its name and place back exactly as read.
      update.mutate(
        fixed
          ? {
              ...organiserInput(form),
              name: fixed.name,
              destinationKey: fixed.destinationKey,
            }
          : organiserInput(form),
        answer,
      );
    } else if (clubId !== undefined) {
      create.mutate(clubOrganiserInput(form, clubId), answer);
    } else {
      create.mutate(organiserInput(form), answer);
    }
  };

  const sendLabel = editing
    ? W.save
    : clubId !== undefined
      ? W.clubCardButton
      : W.send;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mt-6 space-y-6"
      data-testid="organiser-form"
    >
      {fixed ? (
        <FixedPage
          name={fixed.name}
          place={placeName(places.data, fixed.destinationKey)}
          errors={errors}
        />
      ) : (
        <>
          <Field
            label={W.name}
            value={form.name}
            onChange={(e) => set("name", e.currentTarget.value)}
            error={errors.name}
            maxLength={ORGANISER_NAME_MAX}
            autoComplete="organization"
          />

          <PlacePicker
            places={places.data}
            pending={places.isPending}
            value={form.destinationKey}
            error={errors.destinationKey}
            onPick={(key) => set("destinationKey", key)}
          />
        </>
      )}

      <DepartmentPicker
        offered={departments}
        value={form.departments}
        max={ORGANISER_MAX_DEPARTMENTS}
        error={errors.departments}
        onChange={(next) => set("departments", next)}
      />

      <div>
        <label htmlFor={aboutId} className="label text-forest/75">
          {W.about}
        </label>
        <Textarea
          id={aboutId}
          rows={4}
          maxLength={ORGANISER_ABOUT_MAX + 200}
          value={form.about}
          onChange={(e) => set("about", e.currentTarget.value)}
          aria-describedby={`${aboutId}-hint`}
          aria-invalid={errors.about ? true : undefined}
          className={cn(
            "border-paper-line bg-paper-deep text-forest rounded-control mt-2 block w-full border px-4 py-3 text-base outline-none",
            "focus:border-forest/60 focus:bg-paper",
            errors.about && "border-terra-deep",
          )}
        />
        <span
          id={`${aboutId}-hint`}
          className="text-forest/70 mt-1.5 block text-xs"
        >
          {W.aboutHint}
        </span>
        <FieldLine text={errors.about} testId="organiser-form-about-error" />
      </div>

      <OrganiserLinks
        links={form.links}
        errors={errors}
        setLinks={(links) => set("links", links)}
        setErrors={setErrors}
      />

      <Field
        label={W.contactEmail}
        hint={W.contactEmailHint}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={form.contactEmail}
        onChange={(e) => set("contactEmail", e.currentTarget.value)}
        error={errors.contactEmail}
      />

      {editing ? null : (
        <div>
          <div className="rounded-control border-paper-line bg-paper-deep flex items-start gap-3 border px-3.5 py-3">
            <input
              id={runsItId}
              type="checkbox"
              checked={runsIt}
              onChange={(e) => {
                setRunsIt(e.currentTarget.checked);
                setErrors((was) => withoutKey(was, "runsIt"));
              }}
              aria-invalid={errors.runsIt ? true : undefined}
              className="accent-forest mt-0.5 size-5 shrink-0"
            />
            <label htmlFor={runsItId} className="text-pretty">
              {W.runsIt}
            </label>
          </div>
          <FieldLine text={errors.runsIt} testId="organiser-form-runs-it-error" />
        </div>
      )}

      <div>
        <OrganiserWriteError refusal={refusal} onRetry={send} />
        <Button
          type="submit"
          size="lg"
          block
          className="mt-3"
          pending={write.isPending}
          pendingLabel={editing ? W.saving : W.sending}
          data-testid="organiser-form-send"
        >
          {sendLabel}
        </Button>
        {saved ? (
          <p
            role="status"
            className="text-forest/80 mt-3 text-sm"
            data-testid="organiser-form-saved"
          >
            {W.saved}
          </p>
        ) : null}
      </div>
    </form>
  );
}
