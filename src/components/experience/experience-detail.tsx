import type { components } from "@/lib/api/schema.gen";
import { formatFromPrice } from "@/lib/format/money";
import {
  cancellationLine,
  paymentLine,
  registrationLine,
} from "@/lib/booking/listing-lines";
import { formatDuration } from "@/lib/format/time";
import { Screen } from "@/components/chrome/screen";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import { ClockIcon, MapPinIcon, ZapIcon } from "@/components/ui/icons";
import { ShareLink } from "@/components/ui/share-link";
import { OutcomeLink } from "@/components/analytics/outcome-link";
import { BookingLayer } from "./booking-layer";
import { Gallery } from "./gallery";
import { NextDays } from "./next-days";
import { AskAboutButton } from "@/components/trigo/ask-about-button";
import {
  Detail,
  OperatorName,
  Paragraphs,
  mapLink,
} from "./experience-detail-parts";

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
export function ExperienceDetail({
  experience,
  readAt,
  marketName,
}: {
  experience: Experience;
  /** When the server read it: the listing page passes it on to checkout. */
  readAt?: number;
  /**
   * The listing's market by name, from the page's `GET /places`
   * (yuvoy-app#181), for a listing with no location of its own. The swipe's
   * preview has none to give, and then the place line is the activity alone.
   */
  marketName?: string | null;
}) {
  const price = formatFromPrice(experience.fromPrice);
  const cancellation = cancellationLine(experience);
  const registration = registrationLine(experience.compliance);
  const instant = experience.bookingMode === "allotment";
  const duration = formatDuration(experience.durationMinutes);
  /*
    ABSENT MEANS BOOKABLE, and that is not defensive habit: it is a
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
  const bookable = experience.bookable !== false;
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
  // Its own place, else its market's name, else nothing (yuvoy-app#181).
  const eyebrow = [
    experience.activityTypeLabel,
    experience.location ?? marketName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen
      // Reached from the feed, search, saves and a business's page: Back
      // returns to whichever it was, and to the feed from outside.
      back={{ href: "/", label: "the feed", followTrail: true }}
      stageLabel="Experience"
      width="lg"
      hero={
        frames.length > 0 ? (
          <Gallery
            items={frames}
            title={experience.title}
            picture={experience.heroMedia?.id}
          />
        ) : undefined
      }
      heroActions={
        <ShareLink
          path={`/e/${experience.slug}`}
          title={experience.title}
          label="Share this experience"
          outcome={{ subjectId: experience.id, surface: "listing" }}
        />
      }
    >
      <BookingLayer
        experience={experience}
        bookable={bookable}
        readAt={readAt}
        before={
          <>
            {/*
              WHAT the thing is and WHERE, said once. The place used to be
              this line AND a chip below it, two lines apart, and the noun was
              a chip of its own.

              The noun is yuvoy-app#21 §4: the card says "Scuba diving" and
              the page a traveller opens from it did not, so the second screen
              dropped the word the first one used to earn the tap. The LABEL,
              never the key, from the same vocabulary table the operator's own
              picker reads, so the word here cannot disagree with the word
              they chose. Absent on listings that predate the vocabulary, and
              then the place stands alone rather than beside a placeholder.
            */}
            {eyebrow ? (
              <p className="eyebrow text-terra-deep">{eyebrow}</p>
            ) : null}

            <h1 className="voice-host leading-display mt-4 text-4xl text-balance sm:text-5xl">
              {experience.title}
            </h1>

            {experience.summary ? (
              <p className="voice-host text-forest/70 leading-body mt-4 max-w-prose text-base text-pretty">
                {experience.summary}
              </p>
            ) : null}

            {/* The facts, as chips: how long, and how it sells. */}
            <div className="mt-5 flex flex-wrap gap-2">
              {duration ? (
                <Chip>
                  <ClockIcon className="size-4" />
                  {duration}
                </Chip>
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

                {/*
                  When it next runs, weighed with the price. Inside the
                  bookable gate: a listing not on sale has no days to name.
                */}
                <NextDays slug={experience.slug} bookable={bookable} />

                {/*
                  How it is paid for, before anybody reaches the pay step
                  (yuvoy-app#110). A traveller used to find out on the last
                  screen that the counter was the only way to finish.
                */}
                <p className="text-forest/80 mt-3 text-sm">
                  {paymentLine(experience)}
                </p>

                {/*
                  The cancellation rule in one line, weighed with the price
                  (yuvoy-app#112). Only the server's own summary, and nothing
                  when it sends none: see `cancellationLine`.
                */}
                {cancellation ? (
                  <p className="text-forest/70 mt-1 text-sm">
                    {cancellation}
                    {experience.cancellationPolicy ? (
                      <>
                        {" · "}
                        <a
                          href="#cancellation"
                          className="text-terra-deep tap-target underline"
                        >
                          Full policy
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </Panel>

            {/*
              A question about this listing goes to Trigo with the listing
              attached (yuvoy-app#223). Nothing while the release is closed.
            */}
            <div className="empty:hidden">
              <AskAboutButton
                cardId={`exp:${experience.slug}`}
                entry="listing"
              />
            </div>

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
                      The mark is `OperatorName`'s, inside the link to their
                      page. A second copy stood beside it from 13 Sep 2026,
                      when the listing's rebuild brought back the one the
                      business page's link (11 Sep) had moved inside it: two
                      logos, one square and one round, before one name.
                    */}
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
                {/*
                  Their tourism registration while it is valid, and nothing
                  at all when the API sends none (yuvoy-app#219).
                */}
                {registration ? (
                  <p
                    className="text-forest/70 mt-3 text-sm"
                    data-testid="listing-registration"
                  >
                    {registration}
                  </p>
                ) : null}
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
                    <p className="voice-host text-body text-pretty">
                      {meetingText}
                    </p>
                  ) : null}
                  {meetingLandmark ? (
                    <p
                      className={
                        meetingText
                          ? "voice-host text-forest/70 mt-1 text-sm"
                          : "voice-host text-body text-pretty"
                      }
                    >
                      {meetingLandmark}
                    </p>
                  ) : null}
                  {map ? (
                    <OutcomeLink
                      href={map}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "mt-4",
                      })}
                      outcome={{ subjectId: experience.id, surface: "listing" }}
                    >
                      <MapPinIcon className="size-4" />
                      Open in maps
                    </OutcomeLink>
                  ) : null}
                </Panel>
              </section>
            ) : null}

            {/* Shown before payment, never after. */}
            {experience.cancellationPolicy ? (
              <section id="cancellation" className="mt-8 scroll-mt-6">
                <h2 className="label text-forest/75">If it is called off</h2>
                <p className="voice-host text-forest/70 text-body mt-2 max-w-prose text-pretty">
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
