"use client";

import { useId, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/states";
import {
  ORGANISER_MAX_LINKS,
  type OrganiserPageForm,
} from "@/lib/organisers/organisers";
import type {
  OrganiserLink,
  OrganiserLinkKind,
} from "@/lib/organisers/types";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import type { PlaceList } from "@/lib/site/places";

/**
 * The page form's pieces that are more than one field (yuvoy-app#224, the
 * phone's `organiser-form-parts.tsx`): a field's sentence under a group, the
 * place picker, the departments and the links, and for a group's page
 * (yuvoy-app#225) its name and place as fixed text, the place's name, and the
 * line a `409 club_already_linked` hands to the page it opens. Split out of
 * `organiser-form.tsx` to keep it short.
 */

const LINK_KINDS: readonly OrganiserLinkKind[] = [
  "website",
  "meetup",
  "luma",
  "other",
];

/** The sentences without one field's: the same object when it had none. */
export function withoutKey(
  errors: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

/** A field's sentence under a group that is not one Field (the chips, the tick). */
export function FieldLine({
  text,
  testId,
}: {
  text: string | undefined;
  testId: string;
}) {
  if (!text) return null;
  return (
    <span
      role="alert"
      data-testid={testId}
      className="text-terra-deep mt-1.5 block text-xs text-pretty"
    >
      {text}
    </span>
  );
}

/** A group's name and place: shown as text, never typed. */
export type FixedFields = { name: string; destinationKey: string };

/** What the form checks before sending: only what is plainly missing, in the API's own words. */
export function missing(
  form: OrganiserPageForm,
  runsIt: boolean,
  fixed: boolean,
): Record<string, string> {
  const found: Record<string, string> = {};
  if (!fixed && form.name.trim() === "") found.name = W.needName;
  if (!fixed && form.destinationKey === "") found.destinationKey = W.needPlace;
  if (form.departments.length === 0) found.departments = W.needDepartments;
  if (!runsIt) found.runsIt = W.needRunsIt;
  return found;
}

/**
 * A place's name from the list the person can pick, as #224 shows a place;
 * empty when it is not there. A group's place can be outside every list the
 * app can read, so its line stays hidden rather than guess a name from the key,
 * until the API sends the name itself (yuvoy-in/yuvoy-api#596).
 */
export function placeName(
  places: PlaceList | undefined,
  key: string,
): string {
  return (
    places?.markets
      .flatMap((market) => market.destinations)
      .find((destination) => destination.key === key)?.name ?? ""
  );
}

/**
 * A group's name and place on its setup and edit forms (yuvoy-app#225): text,
 * never a field, with the API's sentence for each under its own line. A place
 * the list does not name shows no line of its own, and its sentence goes
 * under the name.
 */
export function FixedPage({
  name,
  place,
  errors,
}: {
  name: string;
  place: string;
  errors: Record<string, string>;
}) {
  const placeError = errors.destinationKey;
  return (
    <div
      className="rounded-card border-paper-line bg-paper-deep border px-4 py-4"
      data-testid="organiser-form-fixed"
    >
      <span className="label text-forest/75 block">{W.name}</span>
      <p
        className="mt-1 font-bold text-pretty break-words"
        data-testid="organiser-form-fixed-name"
      >
        {name}
      </p>
      <FieldLine
        text={errors.name ?? errors.clubId ?? (place ? undefined : placeError)}
        testId="organiser-form-fixed-name-error"
      />
      {place ? (
        <>
          <span className="label text-forest/75 mt-4 block">{W.place}</span>
          <p
            className="mt-1 break-words"
            data-testid="organiser-form-fixed-place"
          >
            {place}
          </p>
          <FieldLine
            text={placeError}
            testId="organiser-form-fixed-place-error"
          />
        </>
      ) : null}
      <p className="text-forest/75 mt-3 text-sm text-pretty">{W.clubFixed}</p>
    </div>
  );
}

/*
  The API's sentence for a `409 club_already_linked`, handed to the organiser
  page the form opens instead, by its id. Kept in this module for the one
  move: the page reads it when it mounts after a move in the app and clears
  it once drawn, and a load from an address finds none, so a link never
  carries it.
*/
let linked: { id: string; message: string } | null = null;

/** The form, on `clubLinked`: the line for the page it is about to open. */
export function handOverLinked(id: string, message: string) {
  linked = { id, message };
}

/** The page: the line handed to it, or null. Reading it changes nothing. */
export function linkedLine(id: string): string | null {
  return linked?.id === id ? linked.message : null;
}

/** The page, once it has drawn the line: a later visit shows none. */
export function clearLinked(id: string) {
  if (linked?.id === id) linked = null;
}

/**
 * Where the page runs things, from the places the person can pick
 * (`/me/places`), by market. One is picked at a time.
 */
export function PlacePicker({
  places,
  pending,
  value,
  error,
  onPick,
}: {
  places: PlaceList | undefined;
  pending: boolean;
  value: string;
  error: string | undefined;
  onPick: (key: string) => void;
}) {
  const id = useId();
  const markets = (places?.markets ?? []).filter(
    (market) => market.destinations.length > 0,
  );
  return (
    <div role="group" aria-labelledby={id} data-testid="organiser-form-place">
      <span id={id} className="label text-forest/75">
        {W.place}
      </span>
      {pending ? (
        <Skeleton className="mt-2 h-10 w-full" />
      ) : markets.length === 0 ? (
        <p className="text-forest/75 mt-2 text-sm text-pretty">{W.noPlaces}</p>
      ) : (
        markets.map((market) => (
          <div key={market.key} className="mt-2">
            {markets.length > 1 ? (
              <span className="text-forest/70 block text-xs break-words">
                {market.name}
              </span>
            ) : null}
            <div className="mt-1.5 flex flex-wrap gap-2">
              {market.destinations.map((place) => (
                <ChipButton
                  key={place.key}
                  pressed={value === place.key}
                  onClick={() => onPick(place.key)}
                  data-testid={`organiser-form-place-${place.key.replace("/", "-")}`}
                >
                  {place.name}
                </ChipButton>
              ))}
            </div>
          </div>
        ))
      )}
      <FieldLine text={error} testId="organiser-form-place-error" />
    </div>
  );
}

/** What the page runs: up to the API's limit, from the vocabulary's list. */
export function DepartmentPicker({
  offered,
  value,
  max,
  error,
  onChange,
}: {
  offered: readonly { key: string; label: string }[];
  value: readonly string[];
  max: number;
  error: string | undefined;
  onChange: (next: string[]) => void;
}) {
  const id = useId();
  const full = value.length >= max;
  return (
    <div
      role="group"
      aria-labelledby={id}
      data-testid="organiser-form-departments"
    >
      <span id={id} className="label text-forest/75">
        {W.departments}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {offered.map((department) => {
          const on = value.includes(department.key);
          return (
            <ChipButton
              key={department.key}
              pressed={on}
              disabled={!on && full}
              onClick={() =>
                onChange(
                  on
                    ? value.filter((key) => key !== department.key)
                    : [...value, department.key],
                )
              }
              data-testid={`organiser-form-department-${department.key}`}
            >
              {department.label}
            </ChipButton>
          );
        })}
      </div>
      <FieldLine text={error} testId="organiser-form-departments-error" />
    </div>
  );
}

/** The page's links: a kind and an address each, up to the API's limit. */
export function OrganiserLinks({
  links,
  errors,
  setLinks,
  setErrors,
}: {
  links: readonly OrganiserLink[];
  errors: Record<string, string>;
  setLinks: (links: OrganiserLink[]) => void;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} data-testid="organiser-form-links">
      <span id={id} className="label text-forest/75">
        {W.links}
      </span>
      {links.map((link, i) => (
        <div
          // A link has no id of its own; its place in the list is what the
          // API's `links.N` sentences name too.
          key={i}
          className="rounded-card border-paper-line mt-2 min-w-0 border px-3 py-3"
          data-testid={`organiser-form-link-${i}`}
        >
          <div className="flex flex-wrap gap-2">
            {LINK_KINDS.map((kind) => (
              <ChipButton
                key={kind}
                size="sm"
                pressed={link.kind === kind}
                onClick={() =>
                  setLinks(
                    links.map((was, at) => (at === i ? { ...was, kind } : was)),
                  )
                }
              >
                {W.linkKind(kind)}
              </ChipButton>
            ))}
          </div>
          <Field
            className="mt-3"
            label={W.linkUrl}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={W.linkPlaceholder}
            value={link.url}
            onChange={(e) => {
              const url = e.currentTarget.value;
              setLinks(
                links.map((was, at) => (at === i ? { ...was, url } : was)),
              );
              setErrors((was) => withoutKey(was, `links.${i}`));
            }}
            error={errors[`links.${i}`]}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setLinks(links.filter((_, at) => at !== i));
              // The sentences under the links after it no longer match their rows.
              setErrors((was) =>
                Object.fromEntries(
                  Object.entries(was).filter(
                    ([key]) => !key.startsWith("links."),
                  ),
                ),
              );
            }}
          >
            {W.removeLink}
          </Button>
        </div>
      ))}
      {links.length < ORGANISER_MAX_LINKS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setLinks([...links, { kind: "website", url: "" }])}
        >
          {W.addLink}
        </Button>
      ) : null}
      <FieldLine text={errors.links} testId="organiser-form-links-error" />
    </div>
  );
}
