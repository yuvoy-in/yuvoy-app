import Link from "@/components/ui/link";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { LoadingState } from "@/components/states";

/**
 * The parts of the Search tab its route fallback draws too, defined once.
 *
 * The fallback used to be the generic sheet: no title, no field, and wider
 * than the screen on a desktop. Then the screen drew its title and field over
 * an empty area for 300ms, then a skeleton faded in whose rows were shorter
 * than the tiles that replaced them (stability audit, 6 Oct 2026). Now the
 * fallback IS the screen's first paint: the same heading, the same field
 * (inert until the screen is there to answer it), the same guide line and
 * the same skeleton, already showing.
 */

export function SearchHeading({
  placeholder = false,
}: {
  placeholder?: boolean;
}) {
  const className =
    "font-display tracking-display leading-display text-3xl text-balance";
  /*
    The fallback's copy is not a heading. A streamed response carries the
    fallback and the page together, so a second <h1> was in every document
    `/search` served, and a screen reader heard the title twice.
  */
  return placeholder ? (
    <p aria-hidden="true" className={className}>
      What is on
    </p>
  ) : (
    <h1 className={className}>What is on</h1>
  );
}

/**
 * A door to the guides, for somebody who opened Search without a plan
 * (yuvoy-app#116 item 3). Guides were in the desktop rail only, so a phone had
 * no way in. The screen shows it only while nothing is typed or applied, where
 * it is the next thing such a person needs.
 */
export function GuideDoor() {
  return (
    <p
      data-motion-key="guide"
      className="text-forest/70 text-body mt-4 text-pretty"
    >
      Not sure where to start?{" "}
      <Link
        href="/guides"
        className="text-forest tap-target font-bold underline underline-offset-4"
      >
        Read a guide
      </Link>
    </p>
  );
}

/**
 * The grid that is coming, breathing (T11 A): `ReelGrid`'s own tiles, two
 * across at 4:5, where the first skeleton was three narrow 9:16 columns and
 * the screen changed shape twice. It breathes as ONE layer, rather than each
 * shape on its own.
 *
 * Its words are the tiles' own line boxes (`ReelGrid`'s `WordsTile`): two
 * lines of title in `text-sm leading-snug`, then the price and the next date
 * in `text-xs`. Bars of a fixed 12px stood in for them, so every row grew by
 * about 40px as the real tiles replaced it and the rows below were pushed
 * down. Two lines of title is what a two-column tile carries for nearly every
 * listing here.
 *
 * `arrive` fades it in, for a wait that began on this screen; a skeleton the
 * route's fallback was already showing is simply still there.
 */
export function SearchSkeleton({ arrive = true }: { arrive?: boolean }) {
  const line = (width: string) => (
    <span className="flex h-[1lh] items-center">
      <span className={`bg-forest/8 block h-3 rounded-full ${width}`} />
    </span>
  );
  return (
    <div className={arrive ? "motion-fade-in" : undefined} aria-hidden="true">
      <div className="skeleton-breath grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <div className="bg-forest/8 rounded-tile aspect-[4/5]" />
            <div className="mt-2 text-sm leading-snug">
              {line("w-[85%]")}
              {line("w-[60%]")}
            </div>
            <div className="mt-0.5 text-xs">{line("w-[40%]")}</div>
            <div className="mt-0.5 text-xs">{line("w-[55%]")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Search tab before its screen arrives: its route's loading boundary.
 *
 * The field and the Filters button are the real ones, inert: a tap or a
 * keystroke here would land in an element about to be replaced, so nothing
 * can reach them until the screen that answers is there.
 */
export function SearchRouteSkeleton() {
  return (
    <Screen>
      <SearchHeading placeholder />
      <div inert className="mt-5 flex items-center gap-3">
        <Field
          className="min-w-0 flex-1"
          label="Search experiences"
          labelHidden
          type="search"
          shape="pill"
          leading={<SearchIcon className="size-5" />}
          placeholder="Diving, boats, Havelock…"
          readOnly
        />
        <Button variant="outline" className="shrink-0">
          Filters
        </Button>
      </div>
      <GuideDoor />
      <div className="mt-8">
        <LoadingState label="Searching">
          <SearchSkeleton arrive={false} />
        </LoadingState>
      </div>
    </Screen>
  );
}
