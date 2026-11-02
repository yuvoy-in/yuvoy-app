"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
  ORGANISER_ABOUT_MAX,
  ORGANISER_MAX_DEPARTMENTS,
  emptyOrganiserForm,
  organiserForm,
  organiserInput,
  type OrganiserPageForm,
} from "@/lib/organisers/organisers";
import {
  organiserRefusal,
  type OrganiserRefusal,
} from "@/lib/organisers/refusal";
import type { Organiser } from "@/lib/organisers/types";
import {
  useCreateOrganiser,
  useOrganiser,
  useUpdateOrganiser,
} from "@/lib/organisers/use-organisers";
import {
  ORGANISER_DEPARTMENTS,
  ORGANISER_WORDS as W,
} from "@/lib/organisers/words";
import { qk } from "@/lib/query/policy";
import { useVocabulary } from "@/lib/search/use-search-reels";
import { usePlaceList } from "@/lib/site/use-place";
import { OrganiserRefusalBlock, OrganiserWriteError } from "./organiser-gate";
import {
  DepartmentPicker,
  FieldLine,
  OrganiserLinks,
  PlacePicker,
  withoutKey,
} from "./organiser-form-parts";
import {
  BACK_TO_HUB,
  OrganiserHeading,
  OrganiserLoading,
  RefetchNotice,
  backToOrganiser,
} from "./organiser-parts";

/**
 * The page form (yuvoy-app#224, the phone's `organiser-form.tsx`):
 *
 *   - `/organiser/new`, "Send for checking". After the 201 the new
 *     organiser's page opens with the thanks line (`?made=1`), in place of
 *     this form, so Back does not come back to a form already sent.
 *   - `/organiser/{id}/edit`, the same form filled, an owner's only. It sends
 *     the whole page: the contact email the owner was shown goes back to keep
 *     it, and a field emptied is left out, which clears it.
 *
 * What was typed stays when a save fails, the button is off while a save is
 * out, and the API's sentence for a field shows under that field. Left out
 * from the phone: setting up from a group (`clubId`), which the web does not
 * build.
 */

export function NewOrganiserForm() {
  return (
    <Screen back={BACK_TO_HUB}>
      <OrganiserHeading>{W.formTitle}</OrganiserHeading>
      <OrganiserFormBody start={emptyOrganiserForm()} />
    </Screen>
  );
}

export function EditOrganiserForm({ id }: { id: string }) {
  const organiser = useOrganiser(id, true);
  const back = backToOrganiser(id);

  if (organiser.isPending) {
    return (
      <OrganiserLoading
        label={W.loadingOrganiser}
        back={back}
        title={W.editTitle}
      />
    );
  }

  if (organiser.data === undefined) {
    return (
      <Screen back={back}>
        <OrganiserHeading>{W.editTitle}</OrganiserHeading>
        <OrganiserRefusalBlock
          refusal={organiserRefusal(organiser.error)}
          onRetry={() => void organiser.refetch()}
        />
      </Screen>
    );
  }

  const page = organiser.data;
  return (
    <Screen back={back}>
      <OrganiserHeading>{W.editTitle}</OrganiserHeading>
      <RefetchNotice query={organiser} />
      {page.role !== "owner" ? (
        <OrganiserRefusalBlock
          refusal={{ kind: "notOwner", message: W.notOwner }}
          onRetry={() => void organiser.refetch()}
        />
      ) : page.state === "closed" ? (
        <Panel
          tone="outline"
          role="status"
          className="mt-6 px-4 py-4"
          data-testid="organiser-edit-closed"
        >
          <p className="text-pretty">{W.closed}</p>
        </Panel>
      ) : (
        // Keyed by the organiser: a read again never resets what the owner is typing.
        <OrganiserFormBody
          key={page.id}
          start={organiserForm(page)}
          id={page.id}
        />
      )}
    </Screen>
  );
}

/** What the form checks before sending: only what is plainly missing, in the API's own words. */
function missing(
  form: OrganiserPageForm,
  runsIt: boolean,
): Record<string, string> {
  const found: Record<string, string> = {};
  if (form.name.trim() === "") found.name = W.needName;
  if (form.destinationKey === "") found.destinationKey = W.needPlace;
  if (form.departments.length === 0) found.departments = W.needDepartments;
  if (!runsIt) found.runsIt = W.needRunsIt;
  return found;
}

function OrganiserFormBody({
  start,
  id,
}: {
  start: OrganiserPageForm;
  id?: string;
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
    router.replace(`/organiser/${encodeURIComponent(organiser.id)}?made=1`);
  };

  const failed = (error: unknown) => {
    const said = organiserRefusal(error);
    if (said.kind === "fields") setErrors({ ...said.fields });
    if (said.kind === "network" && !editing) {
      // No answer: it may have been made, so the list is read again and nothing is sent by itself.
      void qc.invalidateQueries({ queryKey: qk.myOrganisers() });
    }
    setRefusal(said);
  };

  const send = () => {
    if (write.isPending) return;
    setRefusal(null);
    setSaved(false);
    const found = missing(form, runsIt);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setRefusal({ kind: "fields", fields: found, message: W.checkFields });
      return;
    }
    write.mutate(organiserInput(form), { onSuccess: done, onError: failed });
  };

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
      <Field
        label={W.name}
        value={form.name}
        onChange={(e) => set("name", e.currentTarget.value)}
        error={errors.name}
        maxLength={160}
        autoComplete="organization"
      />

      <PlacePicker
        places={places.data}
        pending={places.isPending}
        value={form.destinationKey}
        error={errors.destinationKey}
        onPick={(key) => set("destinationKey", key)}
      />

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
          {editing ? W.save : W.send}
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
