"use client";

import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";

type Safety = components["schemas"]["SafetyRequirements"];

/**
 * T7 — the safety gates, asked before payment.
 *
 * Two rules shape this component, and both come from the contract:
 *
 *   - `declaredClear` omitted is NOT false. The control therefore starts with
 *     NO value: there is no pre-ticked box and no default, because a default
 *     here is an answer nobody gave.
 *   - Age BANDS, never dates of birth. A band is enough to enforce a minimum
 *     and is not identifying, and it is checked against the band's FLOOR.
 */

export const AGE_BANDS = [
  { value: "under_10", label: "Under 10", floor: 0 },
  { value: "10_11", label: "10–11", floor: 10 },
  { value: "12_14", label: "12–14", floor: 12 },
  { value: "15_17", label: "15–17", floor: 15 },
  { value: "18_plus", label: "18 or over", floor: 18 },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number]["value"];

/** Mirrors the server's rule so the form can refuse before it costs a request. */
export function bandMeetsMinimum(band: AgeBand, minAge: number): boolean {
  const floor = AGE_BANDS.find((b) => b.value === band)?.floor ?? 0;
  return floor >= minAge;
}

export function ScreeningFields({
  safety,
  guests,
  declaredClear,
  ageBands,
  onDeclaredClearChange,
  onAgeBandChange,
}: {
  safety: Safety;
  guests: number;
  declaredClear: boolean | undefined;
  ageBands: (AgeBand | undefined)[];
  onDeclaredClearChange: (value: boolean) => void;
  onAgeBandChange: (index: number, band: AgeBand) => void;
}) {
  return (
    <div className="space-y-8">
      {safety.minAge ? (
        <fieldset>
          <legend className="label text-forest/75">Ages in your party</legend>
          <p className="text-forest/70 mt-2 text-sm">
            {/* Explain WHY it is a band, or it reads as a strange question. */}
            A range is all we need, and all we keep. This operator takes people
            aged {safety.minAge} and over.
          </p>
          <div className="mt-4 space-y-3">
            {Array.from({ length: guests }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-forest/70 w-20 shrink-0 text-sm">
                  {i === 0 ? "You" : `Guest ${i + 1}`}
                </span>
                <select
                  aria-label={
                    i === 0 ? "Your age range" : `Guest ${i + 1} age range`
                  }
                  value={ageBands[i] ?? ""}
                  onChange={(e) =>
                    onAgeBandChange(i, e.target.value as AgeBand)
                  }
                  className="rounded-edge border-cream-line bg-cream-deep h-12 flex-1 border px-3 text-sm"
                >
                  <option value="" disabled>
                    Choose a range
                  </option>
                  {AGE_BANDS.map((b) => {
                    const tooYoung = !bandMeetsMinimum(b.value, safety.minAge!);
                    return (
                      <option key={b.value} value={b.value} disabled={tooYoung}>
                        {b.label}
                        {tooYoung ? " — too young for this one" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      {safety.screener ? (
        <fieldset>
          <legend className="label text-forest/75">Health check</legend>
          <p className="text-forest/70 mt-2 text-sm">
            Diving asks this before taking any money, so nobody pays for a dive
            they cannot do.
          </p>

          <ul className="text-forest/70 mt-4 space-y-2 text-sm">
            {safety.screener.questions.map((q) => (
              <li key={q} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="bg-terra mt-2 size-1 shrink-0"
                />
                {q}
              </li>
            ))}
          </ul>

          {/*
            No default, no pre-tick. Two explicit choices, because omitted is
            not false and false is not a failure — it is a conversation.
          */}
          <div className="mt-5 space-y-2.5">
            <ScreenerChoice
              name="declaredClear"
              checked={declaredClear === true}
              onSelect={() => onDeclaredClearChange(true)}
              label={safety.screener.affirmation}
            />
            <ScreenerChoice
              name="declaredClear"
              checked={declaredClear === false}
              onSelect={() => onDeclaredClearChange(false)}
              label="One or more of these applies to someone in my party."
            />
          </div>

          {declaredClear === false ? (
            /*
              Not an error. Nothing has been booked and no money taken — the
              whole transaction rolls back server-side. Somebody who has
              already paid is somebody who will argue to be let in the water.
            */
            <div
              role="status"
              className="rounded-edge border-terra-deep bg-cream-deep mt-4 border-l-2 p-4"
            >
              <p className="text-sm font-bold">Let us talk first</p>
              <p className="text-forest/70 mt-1.5 text-sm">
                That does not mean no. It means a quick word with the dive team
                before you book, so nobody is turned away at the jetty. Nothing
                has been booked and nothing has been charged.
              </p>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

function ScreenerChoice({
  name,
  checked,
  onSelect,
  label,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        "rounded-edge flex cursor-pointer gap-3 border p-4 text-sm",
        checked ? "border-terra-deep bg-cream-deep" : "border-cream-line",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-terra-deep mt-0.5 shrink-0"
      />
      <span className="text-forest/80">{label}</span>
    </label>
  );
}
