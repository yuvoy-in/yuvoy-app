import Image from "next/image";
import type { components } from "@/lib/api/schema.gen";
import { formatFromPrice } from "@/lib/format/money";
import { AvailabilityPicker } from "./availability-picker";

type Experience = components["schemas"]["Experience"];

/**
 * T3 — everything needed to commit.
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
  const hero = experience.gallery[0] ?? experience.heroMedia;
  const instant = experience.bookingMode === "allotment";

  return (
    <div className="bg-cream text-forest min-h-full">
      {/* Hero. 4:5 rather than 9:16 — this is a page to read, not a feed. */}
      {hero ? (
        <div className="bg-abyss relative aspect-4/5 w-full sm:aspect-video">
          <Image
            src={hero.posterUrl}
            alt={hero.alt ?? experience.title}
            fill
            sizes="(min-width: 1024px) 900px, 100vw"
            className="object-cover"
            priority
            unoptimized={hero.posterUrl.startsWith("data:")}
          />
        </div>
      ) : null}

      <div className="container-page py-8">
        <p className="eyebrow text-terra-deep">
          {experience.location ?? "Andaman"}
        </p>

        <h1 className="font-display tracking-display mt-4 text-4xl leading-[1.05] sm:text-5xl">
          {experience.title}
        </h1>

        {experience.summary ? (
          <p className="text-forest/70 mt-4 max-w-prose text-base">
            {experience.summary}
          </p>
        ) : null}

        {/* Price and mode, above the fold on a phone. */}
        <div className="border-cream-line mt-8 flex flex-wrap items-end justify-between gap-4 border-y py-5">
          <div>
            <p className="label text-forest/75">Price</p>
            {price ? (
              <p className="mt-1 text-2xl font-bold">
                {price}
                <span className="text-forest/70 ml-1.5 text-xs font-normal">
                  per person · all-in
                </span>
              </p>
            ) : (
              <p className="text-forest/70 mt-1 text-sm">
                No price set yet. Ask us and we will confirm before you commit.
              </p>
            )}
          </div>
          <p className="label text-terra-deep">
            {instant ? "Instant book" : "Operator confirms first"}
          </p>
        </div>

        {/* The operator, and only what a record backs. */}
        <section className="mt-8">
          <h2 className="label text-forest/75">Who runs this</h2>
          <div className="rounded-edge border-cream-line bg-cream-deep mt-3 border p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{experience.operator.name}</p>
              {experience.operator.verified ? (
                <span className="label text-terra-deep">Verified</span>
              ) : (
                <span className="label text-forest/70">Checks in progress</span>
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
          </div>
        </section>

        {/* T4 lives here. Client-side, never cached with this page. */}
        <section className="mt-10">
          <h2 className="font-display tracking-display text-2xl">Pick a day</h2>
          <AvailabilityPicker
            slug={experience.slug}
            bookingMode={experience.bookingMode}
          />
        </section>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {experience.included?.length ? (
            <Detail title="Included" items={experience.included} />
          ) : null}
          {experience.requirements?.length ? (
            <Detail title="You need" items={experience.requirements} />
          ) : null}
        </div>

        <section className="mt-8">
          <h2 className="label text-forest/75">Where you meet</h2>
          <p className="mt-2 text-sm">{experience.meetingPoint.text}</p>
          {experience.meetingPoint.landmark ? (
            <p className="text-forest/70 mt-1 text-sm">
              {experience.meetingPoint.landmark}
            </p>
          ) : null}
        </section>

        {/* Shown before payment, never after. */}
        {experience.cancellationPolicy ? (
          <section className="mt-8 mb-4">
            <h2 className="label text-forest/75">If it is called off</h2>
            <p className="text-forest/70 mt-2 max-w-prose text-sm">
              {experience.cancellationPolicy}
            </p>
          </section>
        ) : null}
      </div>
    </div>
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
