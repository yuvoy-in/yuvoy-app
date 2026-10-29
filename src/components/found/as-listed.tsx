import { useId } from "react";
import {
  STATED_WORDS,
  asListedLine,
  asListedRows,
  statedSections,
  type StatedCard,
} from "@/lib/found/stated";

/**
 * What a card's own page states, on the card page (yuvoy-app#195, R3-T6),
 * drawn after when, where and the price, and only while `checkedCities` is
 * open to the caller (the card page decides that).
 *
 * As listed is a quiet panel of its own, headed "As listed", with one line
 * under the heading saying where the facts are from and who checked what,
 * then a row for each stated fact. It is drawn only when at least one row is
 * stated. What's included and Good to know follow as sections of their own,
 * each only when stated and each ending with where it is from, so a card
 * that states only what is included has that section and no panel.
 *
 * Nothing stated is nothing drawn: no heading, no empty line, no space. The
 * words and the rules are `lib/found/stated.ts`'s, the phone's.
 */
export function AsListed({ item }: { item: StatedCard }) {
  const headingId = useId();
  const rows = asListedRows(item);
  const sections = statedSections(item);
  if (rows.length === 0 && sections.length === 0) return null;

  return (
    <>
      {rows.length > 0 ? (
        <section
          aria-labelledby={headingId}
          className="rounded-card bg-paper-deep mt-6 px-4 py-4"
          data-testid="found-as-listed"
        >
          <h2 id={headingId} className="font-bold">
            {STATED_WORDS.heading}
          </h2>
          <p
            className="text-forest/75 mt-1 text-sm text-pretty"
            data-testid="found-as-listed-line"
          >
            {asListedLine(item)}
          </p>
          <ul className="divide-paper-line mt-3 flex flex-col divide-y">
            {rows.map((row) => (
              <li
                key={row}
                className="py-2.5"
                data-testid="found-as-listed-row"
              >
                {row}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sections.map((section) => (
        <section
          key={section.key}
          className="mt-6"
          data-testid={`found-${section.key}`}
        >
          <h2 className="font-bold">{section.title}</h2>
          <p className="mt-1 text-pretty">{section.body}</p>
          {section.from ? (
            <p className="text-forest/75 mt-1 text-sm">{section.from}</p>
          ) : null}
        </section>
      ))}
    </>
  );
}
