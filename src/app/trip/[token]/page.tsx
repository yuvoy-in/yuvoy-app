import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";

export const metadata: Metadata = {
  title: "The trip",
  // A shared link is still a link somebody could paste anywhere.
  robots: { index: false, follow: false },
};

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
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-md py-8">
        <p className="eyebrow text-terra-deep">You are invited</p>
        <h1 className="font-display tracking-display mt-3 text-3xl leading-tight">
          {trip.experience}
        </h1>

        {trip.cancelled ? (
          <div
            role="status"
            className="rounded-edge border-terra-deep mt-5 border-l-2 p-4"
          >
            <p className="text-sm font-bold">This trip was called off</p>
            <p className="text-forest/70 mt-1.5 text-sm">
              Whoever booked it will have been refunded. Nothing for you to do.
            </p>
          </div>
        ) : null}

        <dl className="border-cream-line mt-8 space-y-4 border-t pt-6 text-sm">
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
      </div>
    </div>
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
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
      <dt className="label text-forest/75">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
