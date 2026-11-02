"use client";

import { useId } from "react";
import { ChipButton } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { useRelease } from "@/lib/site/use-release";
import { LANGUAGES, ME_WORDS } from "@/lib/me/words";
import { useMeSettings, useUpdateMeSettings } from "@/lib/me/use-me-settings";
import { toggledLanguages } from "@/lib/me/me-helpers";
import type { MySettings } from "@/lib/me/types";
import { useMeOpen } from "./me-section";

/**
 * Me's two settings on Account (yuvoy-mobile#444), beside Count my usage:
 * "Languages I'm happy with", four chips and the note under them, and
 * "Women-only tables", a switch shown only while `tables` is open, since
 * there is no table list to hide them from before that.
 *
 * They wait for the account's read; until it answers, and when it cannot be
 * read, there are none, so nothing shows a value the account may not hold.
 * Each change saves alone, and one that did not go through goes back to how
 * it was and says so.
 */
export function MeSettings({ className }: { className?: string }) {
  return useMeOpen() ? <Settings className={className} /> : null;
}

function Settings({ className }: { className?: string }) {
  const read = useMeSettings(true);
  const tables = useRelease("tables");
  if (!read.data) return null;
  return (
    <div className={cn("space-y-8", className)}>
      <Languages settings={read.data} />
      {tables.open ? <WomenOnly settings={read.data} /> : null}
    </div>
  );
}

function Languages({ settings }: { settings: MySettings }) {
  const ids = useId();
  // The hook shows a tap at once and puts it back when it fails.
  const save = useUpdateMeSettings();
  const failed =
    Boolean(save.error) && Boolean(save.variables && "languages" in save.variables);
  const shown = settings.languages;
  return (
    <section aria-labelledby={`${ids}-head`}>
      <h2 id={`${ids}-head`} className="label text-forest/75">
        {ME_WORDS.languagesTitle}
      </h2>
      <div
        role="group"
        aria-labelledby={`${ids}-head`}
        aria-describedby={`${ids}-note`}
        className="mt-3 flex flex-wrap gap-2"
      >
        {LANGUAGES.map((language) => (
          <ChipButton
            key={language.key}
            pressed={shown.includes(language.key)}
            // Exactly the chips tapped, in the chips' order.
            onClick={() =>
              save.mutate({ languages: toggledLanguages(shown, language.key) })
            }
          >
            {language.label}
          </ChipButton>
        ))}
      </div>
      <p id={`${ids}-note`} className="text-forest/70 mt-3 text-xs text-pretty">
        {ME_WORDS.languagesNote}
      </p>
      {failed ? (
        <p role="alert" className="text-terra-deep mt-2 text-xs">
          {ME_WORDS.changeFailed}
        </p>
      ) : null}
    </section>
  );
}

/** The same switch as Count my usage (`usage-setting.tsx`). */
function WomenOnly({ settings }: { settings: MySettings }) {
  const ids = useId();
  const save = useUpdateMeSettings();
  const failed =
    Boolean(save.error) &&
    Boolean(save.variables && "showWomenOnlyTables" in save.variables);
  const on = settings.showWomenOnlyTables;
  return (
    <section aria-labelledby={`${ids}-head`}>
      <h2 id={`${ids}-head`} className="label text-forest/75">
        {ME_WORDS.womenOnlyTitle}
      </h2>
      <div className="mt-3 flex items-start justify-between gap-4">
        <p id={`${ids}-sub`} className="text-body min-w-0 font-bold text-pretty">
          {ME_WORDS.womenOnlyLabel}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${ids}-sub`}
          onClick={() => save.mutate({ showWomenOnlyTables: !on })}
          // 44px tall, the system's control height, around a 28px track.
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className={cn(
              "ease-interaction relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200",
              on ? "bg-forest" : "bg-forest/20",
            )}
          >
            <span
              className={cn(
                "bg-paper ease-interaction inline-block size-5 rounded-full shadow-sm transition-transform duration-200",
                on ? "translate-x-6" : "translate-x-1",
              )}
            />
          </span>
        </button>
      </div>
      {failed ? (
        <p role="alert" className="text-terra-deep mt-2 text-xs">
          {ME_WORDS.changeFailed}
        </p>
      ) : null}
    </section>
  );
}
