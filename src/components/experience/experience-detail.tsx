import Link from "next/link";
import type { components } from "@/lib/api/schema.gen";
import { formatFromPrice } from "@/lib/format/money";
import { paragraphsOf } from "@/lib/format/paragraphs";
import { formatDuration } from "@/lib/format/time";
import { Screen } from "@/components/chrome/screen";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import {
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  ZapIcon,
} from "@/components/ui/icons";
import { ShareLink } from "@/components/ui/share-link";
import { BookingLayer } from "./booking-layer";
import { Gallery } from "./gallery";

type Experience = components["schemas"]["Experience"];

/**
 * T3 — everything needed to commit.
 *
 * The hero photograph fills the stage and the sheet rises over it; the back
 * and share discs float on the picture. Below the fold the page is a reading
 * surface, and the one action — a chosen departure — arrives as a sticky bar
 * from `BookingLayer` rather than a button lost mid-page.
 *
 * Two things this page deliberately does NOT have:
 *
 *   - A star rating. There are no operator ratings anywhere, on purpose:
 *     reviews do not exist until real completed bookings produce them, and a
 *     number nobody earned is a fabricated claim. What an operator carries is
 *     `verified` plus `credentialsSummary` — human-readable statements each
 *     backed by a record we hold.
 *   - Urgency. No "3 people are looking at this". The only scarcity shown is
 *     the real seat count, and only when it is real.
 */
export function ExperienceDetail({ experience }: { experience: Experience }) {
  const price = formatFromPrice(experience.fromPrice);
  const instant = experience.bookingMode === "allotment";
  const duration = formatDuration(experience.durationMinutes);
  /*
    Everything there is to look at, in one gallery — yuvoy-app#32.

    It was `gallery[0] ?? heroMedia` at the top and `gallery.slice(1)` in a
    strip of 160px thumbnails further down called "More from the water", which
    were not links to anything. So a listing with six clips showed one where it
    mattered and five below the fold. The owner asked for "a proper gallery:
    swipe between them and a full-screen view".

    `heroMedia` is the fallback for a listing whose `gallery` is empty, not an
    extra frame beside it: the contract makes the hero one OF the gallery, so
    adding both would repeat the first picture.
  */
  const frames =
    experience.gallery.length > 0
      ? experience.gallery
      : experience.heroMedia
        ? [experience.heroMedia]
        : [];
  const map = mapLink(experience.meetingPoint);
  // See the "Where you meet" section for why these are trimmed rather than
  // read straight off the response.
  const meetingText = experience.meetingPoint.text?.trim();
  const meetingLandmark = experience.meetingPoint.landmark?.trim();
  const location = experience.location ?? "Andaman";

  return (
    <Screen
      back={{ href: "/", label: "the feed" }}
      stageLabel="Experience"
      width="lg"
      hero={
        frames.length > 0 ? (
          <Gallery items={frames} title={experience.title} />
        ) : undefined
      }
      heroActions={
        <ShareLink
          path={`/e/${experience.slug}`}
          title={experience.title}
          label="Share this experience"
        />
      }
    >
      <BookingLayer
        experience={experience}
        /*
          ABSENT MEANS BOOKABLE, and that is not defensive habit — it is a
          production regression this line already caused once.

          The contract at the pinned commit marks `bookable` required, so this
          read `experience.bookable` and treated `undefined` as false. But the
          contract is what MASTER declares, not what `api.yuvoy.in` is running:
          migration 0053 was merged and not yet deployed, so the live API sent
          no such field and every listing on production said "not available to
          book" the moment this shipped.

          A pinned contract says what the API will send, never what it does
          send today. So the check is `!== false`: absent falls back to the
          behaviour that was correct before the field existed, which is the
          only reading that is safe against a deployment lag in either
          direction.
        */
        bookable={experience.bookable !== false}
        before={
          <>
            <p className="eyebrow text-terra-deep">{location}</p>

            <h1 className="font-display tracking-display mt-4 text-4xl leading-[1.05] sm:text-5xl">
              {experience.title}
            </h1>

            {experience.summary ? (
              <p className="text-forest/70 mt-4 max-w-prose text-base">
                {experience.summary}
              </p>
            ) : null}

            {/* The facts, as chips: where, how long, and how it sells. */}
            <div className="mt-5 flex flex-wrap gap-2">
              <Chip>
                <MapPinIcon className="size-4" />
                {location}
              </Chip>
              {duration ? (
                <Chip>
                  <ClockIcon className="size-4" />
                  {duration}
                </Chip>
              ) : null}
              {/*
                WHAT the thing is — yuvoy-app#21 §4. The card says "Scuba
                diving" and the page a traveller opens from it did not, so the
                second screen dropped the noun the first one used to earn the
                tap.

                The LABEL, never the key, and from the same vocabulary table
                the operator's own picker reads — so the word here cannot
                disagree with the word they chose. Absent on listings that
                predate the vocabulary, and nothing is rendered rather than a
                placeholder noun.
              */}
              {experience.activityTypeLabel ? (
                <Chip>{experience.activityTypeLabel}</Chip>
              ) : null}
              <Chip tone={instant ? "accent" : "neutral"}>
                {instant ? <ZapIcon className="size-4" /> : null}
                {instant ? "Instant book" : "Operator confirms first"}
              </Chip>
            </div>

            {/* Price and the way to a date, above the fold on a phone. */}
            <Panel className="mt-8 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="label text-forest/75">Price</p>
                {price ? (
                  <p className="mt-1 text-3xl font-bold">
                    {price}
                    {/*
                      The server's phrase, VERBATIM — yuvoy-app#20 §1. This said
                      "per person" on its own authority, and the platform has
                      always supported group pricing with checkout dividing
                      correctly for it, so a ₹12,000 charter for six read as
                      ₹12,000 per person on one of the two screens a traveller
                      decides from. That is a consumer pricing misstatement.

                      Never built from `pricingUnit`: the contract is explicit
                      that a client deriving its own phrase is a second copy of
                      a rule the API owns, and the copy that drifts is the one
                      that misstates a price. Money FORMATTING stays ours; the
                      unit phrase does not.

                      Both fields are present exactly when `fromPrice` is, so
                      the fallback is unreachable in practice — it exists so a
                      contract that ever loosened cannot silently reintroduce
                      the claim.
                    */}
                    {experience.pricingUnitLabel ? (
                      <span className="text-forest/70 ml-2 text-xs font-normal">
                        {experience.pricingUnitLabel} · all-in
                      </span>
                    ) : (
                      <span className="text-forest/70 ml-2 text-xs font-normal">
                        all-in
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-forest/70 mt-1 max-w-xs text-sm">
                    No price set yet. Ask us and we will confirm before you
                    commit.
                  </p>
                )}
              </div>
            </Panel>

            {/*
              The operator's own words — yuvoy-app#21 §1.

              `description` is what a business sat down and typed into the
              portal about their own day: the site, the boat, what you will
              see. It has been on the contract and plumbed the whole way for
              some time, and this page never read it, so every paragraph of it
              was discarded in the browser while their own portal showed it
              back to them correctly.

              Rendered as paragraphs, because they typed newlines and a
              run-on block is not what they wrote. `omitempty` on the wire, so
              an empty one is ABSENT rather than "", and `Paragraphs` still
              refuses to render a blank section if that ever changes.
            */}
            <Paragraphs
              title="About this experience"
              text={experience.description}
            />

            {/*
              What the day asks of you — yuvoy-app#21 §2.

              Deliberately its own section and deliberately not styled like
              "You need". `requirements` is a checklist; `safetyNotes` is the
              operator telling a traveller in their own words what the water
              is like — "there is current here, you must be able to swim 200m
              unaided". A third thing again from `safety`, the structured
              screener that drives the checkout form.

              Above the gallery on purpose. It is a thing to read before
              picking a date, not something to find below the fold, and the
              alert tone is the accent hairline this system uses for a warning
              — never a red.
            */}
            <Paragraphs
              title="Before you book"
              text={experience.safetyNotes}
              tone="alert"
            />

            {/*
              The operator, and only what a record backs.

              "Who runs this" became "Operator" and gained their logo, on the
              owner's walk (yuvoy-app#32). The heading was a sentence answering
              a question nobody had asked; the mark is what a traveller
              recognises, and it is the one thing on this row that is theirs.
            */}
            <section className="mt-8">
              <h2 className="label text-forest/75">Operator</h2>
              <Panel className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {/*
                      `logoUrl` is absent when they have not set one, so there
                      is no placeholder branch and no broken-image state to
                      design around — the name simply stands alone, as it did
                      before.

                      A plain `<img>`: a small mark beside a name, not the LCP
                      element, loaded straight from Cloudflare Images, which is
                      the host the CSP's `img-src` names for it.
                    */}
                    {experience.operator.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={experience.operator.logoUrl}
                        alt=""
                        aria-hidden="true"
                        className="rounded-tile bg-paper-deep border-paper-line size-10 shrink-0 border object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    <OperatorName operator={experience.operator} />
                  </div>
                  {experience.operator.verified ? (
                    <Chip tone="accent" size="sm">
                      Verified
                    </Chip>
                  ) : (
                    <Chip size="sm" className="text-forest/70">
                      Checks in progress
                    </Chip>
                  )}
                </div>
                {experience.operator.credentialsSummary?.length ? (
                  <ul className="text-forest/70 mt-3 space-y-1.5 text-sm">
                    {experience.operator.credentialsSummary.map((c) => (
                      <li key={c} className="flex gap-2.5">
                        <span
                          aria-hidden="true"
                          className="bg-terra mt-2 size-1 shrink-0"
                        />
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            </section>

            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              {experience.included?.length ? (
                <Detail title="Included" items={experience.included} />
              ) : null}
              {experience.requirements?.length ? (
                <Detail title="You need" items={experience.requirements} />
              ) : null}
            </div>

            {/*
              yuvoy-app#25 — this section used to render unconditionally while
              everything inside it was guarded, so a listing with an empty
              meeting point showed a heading over an empty outlined box. Live
              on two production listings when it was found.

              `meetingPoint` is REQUIRED on `Experience` and the read path
              coerces a NULL column to "" rather than omitting the field, so
              the object is always present and optional chaining never fires.
              An empty string is the one shape `?.` does not protect against.

              Trimmed, because the publish gate added in migration 0055 treats
              whitespace-only as empty (`btrim(coalesce(...,'')) = ''`) and the
              screen must agree with the gate. That gate guards the TRANSITION
              into published and deliberately unpublishes nothing, so the two
              listings already in that state stay live and stay sellable —
              which is exactly why this has to be handled here rather than
              waited out in the data.

              A landmark or a pin on their own are still worth a section: they
              are the answer to "where", just a coarser one. Nothing at all
              renders nothing at all — no heading, no box, and no "to be
              confirmed", which would be a promise nobody made.
            */}
            {meetingText || meetingLandmark || map ? (
              <section className="mt-8">
                <h2 className="label text-forest/75">Where you meet</h2>
                <Panel tone="outline" className="mt-3">
                  {meetingText ? (
                    <p className="text-sm font-bold">{meetingText}</p>
                  ) : null}
                  {meetingLandmark ? (
                    <p
                      className={
                        meetingText
                          ? "text-forest/70 mt-1 text-sm"
                          : "text-sm font-bold"
                      }
                    >
                      {meetingLandmark}
                    </p>
                  ) : null}
                  {map ? (
                    <a
                      href={map}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "mt-4",
                      })}
                    >
                      <MapPinIcon className="size-4" />
                      Open in maps
                    </a>
                  ) : null}
                </Panel>
              </section>
            ) : null}

            {/* Shown before payment, never after. */}
            {experience.cancellationPolicy ? (
              <section className="mt-8">
                <h2 className="label text-forest/75">If it is called off</h2>
                <p className="text-forest/70 mt-2 max-w-prose text-sm">
                  {experience.cancellationPolicy}
                </p>
              </section>
            ) : null}
          </>
        }
      />
    </Screen>
  );
}

/**
 * Who runs it: their mark, their name, and the way to everything else they
 * run.
 *
 * The link is yuvoy-app#30 — a page about the business existed and nothing a
 * traveller was reading led to it. The whole row is the target rather than
 * the name alone: the logo is what somebody recognised in the feed and the
 * bigger thing to aim at, and the chevron says the row goes somewhere.
 *
 * By `slug`, never `id` — the id is ours. A plain row when `slug` is absent:
 * the contract marks it required, and a pinned contract says what the API
 * WILL send, not what the deployed one does.
 */
function OperatorName({ operator }: { operator: Experience["operator"] }) {
  const mark = (
    <>
      {/*
        The operator's mark — yuvoy-app#21 §3. A traveller who recognised the
        logo in the feed landed on the page about that business and found it
        gone.

        A plain `<img>`, as on the card: a small mark that is never the LCP
        element, loaded straight from Cloudflare Images — whose host the CSP's
        `img-src` names for exactly this. Absent means no logo, so there is no
        placeholder branch and no broken-image state: the name alone is what
        was here before and is what stays.
      */}
      {operator.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={operator.logoUrl}
          alt=""
          className="size-10 shrink-0 rounded-full object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className="truncate font-bold">{operator.name}</span>
    </>
  );

  if (!operator.slug) {
    return <div className="flex min-w-0 items-center gap-3">{mark}</div>;
  }

  return (
    <Link
      href={`/o/${operator.slug}`}
      className="ease-interaction flex min-h-11 min-w-0 items-center gap-3 transition-opacity duration-200 hover:opacity-80"
    >
      {mark}
      <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
    </Link>
  );
}

/**
 * A maps link from the meeting point's coordinates, when it has them.
 *
 * A universal maps URL rather than `geo:` — it opens the phone's own maps app
 * on iOS and Android and a web map everywhere else, and the query is the
 * coordinates, not the text, so a jetty called "Jetty 2" resolves to the
 * jetty and not to a search.
 */
function mapLink(point: Experience["meetingPoint"]): string | null {
  if (typeof point.lat !== "number" || typeof point.lng !== "number") {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}

/**
 * A block of prose the OPERATOR wrote, as paragraphs.
 *
 * Both `description` and `safetyNotes` are free text typed into a textarea in
 * the portal, so the newlines in them are the author's paragraph breaks and a
 * single run-on block is not what they wrote. Runs of blank lines collapse to
 * one break, which is what somebody leaning on the return key meant.
 *
 * Renders NOTHING when there is nothing to say. Both fields are `omitempty`
 * on the wire so an empty one is absent rather than "", but the trim-and-test
 * here is what makes that a property of this component rather than a promise
 * about the server — the same lesson `meetingPoint.text` taught on this page.
 */
function Paragraphs({
  title,
  text,
  tone,
}: {
  title: string;
  text?: string;
  tone?: "alert";
}) {
  const paragraphs = paragraphsOf(text);
  if (paragraphs.length === 0) return null;

  const body = (
    <div className="max-w-prose space-y-3 text-sm">
      {paragraphs.map((paragraph, i) => (
        <p key={`${i}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </div>
  );

  return (
    <section className="mt-8">
      <h2 className="label text-forest/75">{title}</h2>
      {tone === "alert" ? (
        <Panel tone="alert" className="text-forest/80 mt-3">
          {body}
        </Panel>
      ) : (
        <div className="text-forest/70 mt-3">{body}</div>
      )}
    </section>
  );
}

function Detail({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="label text-forest/75">{title}</h2>
      <ul className="text-forest/70 mt-3 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className="bg-terra mt-2 size-1 shrink-0"
            />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}
