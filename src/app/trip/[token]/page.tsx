import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { pageMetadata } from "@/lib/site/metadata";
import { Screen } from "@/components/chrome/screen";
import { Panel } from "@/components/ui/panel";

/**
 * The trip's own name in the tab, not the word "trip" — yuvoy-app#16.
 *
 * A browser tab shows roughly the first twenty characters, and `The trip ·
 * Yuvoy` is the same tab however many are open. The experience name is what
 * the page's own heading already says, so it identifies without revealing:
 * this view carries no payer details by design, and the token stays in the
 * path where it was, never in the title.
 *
 * A failure falls back to the plain word rather than throwing. A title is not
 * worth a 500, and calling `notFound()` from here would pre-empt the page's
 * own handling of the same absence.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const base: Metadata = {
    title: "The trip",
    // A shared link is still a link somebody could paste anywhere.
    robots: privateRobotsMeta,
  };
  try {
    const { token } = await params;
    const api = createApiClient();
    const { data, error } = await api.GET("/trips/{token}", {
      params: { path: { token } },
    });
    if (error || !data?.experience) return base;

    /*
      Real Open Graph, not the homepage's — this is the one page in the app
      whose whole purpose is being sent to somebody. Inheriting the root's card
      is the exact defect `e2e/seo.spec.ts` guards: right in the tab, wrong in
      the only surface anybody else sees.

      The description names the experience and nothing else. Not the meeting
      point, not the time, not the party size — an unfurl travels further than
      the link it came from, into a group chat and a preview cache, and this
      view was built to carry no payer details for the same reason. The token
      is in the path and is never put in a tag.
    */
    return {
      ...pageMetadata({
        title: data.experience,
        description: "A trip on Yuvoy. Open the link to see the details.",
        path: `/trip/${token}`,
      }),
      robots: privateRobotsMeta,
    };
  } catch {
    return base;
  }
}

export const dynamic = "force-dynamic";

/**
 * The shared trip view.
 *
 * A separate token from the status token, and deliberately carrying NO payer
 * details: four friends on a dive should see the meeting point and the time
 * without seeing each other's money. It also cannot cancel anything, which is
 * the other half of why it is a different token.
 *
 * Server-rendered, unlike /booking — this token is in the PATH rather than a
 * fragment, because it is meant to be sent to other people and a fragment does
 * not survive being retyped or read aloud.
 */
export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let trip;
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/trips/{token}", {
      params: { path: { token } },
    });
    if (error) throw error;
    trip = data;
  } catch (err) {
    if (err instanceof YuvoyError && err.code === "not_found") notFound();
    throw err;
  }

  return (
    <Screen
      back={{ href: "/", label: "the feed" }}
      stageLabel="Shared with you"
    >
      <p className="eyebrow text-terra-deep">You are invited</p>
      <h1 className="font-display tracking-display mt-3 text-3xl leading-tight">
        {trip.experience}
      </h1>

      {trip.cancelled ? (
        <Panel tone="alert" role="status" className="mt-5">
          <p className="text-sm font-bold">This trip was called off</p>
          <p className="text-forest/70 mt-1.5 text-sm">
            Whoever booked it will have been refunded. Nothing for you to do.
          </p>
        </Panel>
      ) : null}

      <Panel className="mt-8 p-0">
        <dl className="divide-cream-line divide-y text-sm">
          <Row label="When">
            {trip.localTime} on{" "}
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Asia/Kolkata",
            }).format(new Date(`${trip.localDate}T12:00:00+05:30`))}
          </Row>
          <Row label="Where">
            {trip.meetingPoint}
            {trip.landmark ? (
              <span className="text-forest/70 mt-1 block text-xs">
                {trip.landmark}
              </span>
            ) : null}
          </Row>
          <Row label="Who is coming">{trip.partySize}</Row>
          {trip.operator ? <Row label="Run by">{trip.operator}</Row> : null}
        </dl>
      </Panel>

      {trip.bring?.length ? (
        <section className="mt-8">
          <h2 className="label text-forest/75">Bring</h2>
          <ul className="text-forest/70 mt-3 space-y-1.5 text-sm">
            {trip.bring.map((b) => (
              <li key={b} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="bg-terra mt-2 size-1 shrink-0"
                />
                {b}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-forest/70 mt-8 text-xs">
        This is a view of somebody else&apos;s booking. It does not show what
        was paid, and it cannot change or cancel anything.
      </p>
    </Screen>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-4">
      <dt className="label text-forest/75">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
