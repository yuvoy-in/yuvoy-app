import Link from "@/components/ui/link";
import type { components } from "@/lib/api/schema.gen";
import { paragraphsOf } from "@/lib/format/paragraphs";
import { Panel } from "@/components/ui/panel";
import { ChevronRightIcon } from "@/components/ui/icons";

type Experience = components["schemas"]["Experience"];

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
export function OperatorName({
  operator,
}: {
  operator: Experience["operator"];
}) {
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
      <span className="voice-host truncate">{operator.name}</span>
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
export function mapLink(point: Experience["meetingPoint"]): string | null {
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
export function Paragraphs({
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
    <div className="voice-host leading-body max-w-prose space-y-3 text-sm text-pretty">
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

export function Detail({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="label text-forest/75">{title}</h2>
      <ul className="voice-host text-forest/70 leading-body mt-3 space-y-1.5 text-sm text-pretty">
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
