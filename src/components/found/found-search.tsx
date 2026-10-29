"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SearchIcon } from "@/components/ui/icons";
import { FOUND_Q_MAX, type FoundSearch } from "@/lib/found/found-filters";
import { foundWords } from "@/lib/found/found-words";
import { useChangedBeforeHydration } from "@/lib/react/use-changed-before-hydration";

/**
 * Search inside a place (yuvoy-app#180, R3-T2's `q` on `GET /events`): a
 * field named "Search {place}", a submit, and Clear search.
 *
 * ## Searched on submit, not on every key
 *
 * The words go to the API whole, and the API reads them (a department, a day,
 * free, another place) and says what it understood. Half a word typed is not
 * a question the server should answer with chips, so nothing is asked until
 * the search is sent. What is sent and how is the caller's (`onSearch`): this
 * only says what was typed.
 *
 * ## It works before the script does
 *
 * The server draws the field, and on a slow link it is there for seconds
 * before its script. So it is a real `GET` form on `/`, carrying the place
 * and what else is chosen as hidden fields (`keep`): sent in that time, the
 * browser asks the server for the search and the server reads `?q=` for page
 * one. A word typed in that time and sent after is handed over as the page
 * hydrates (`useChangedBeforeHydration`).
 *
 * ## The applied search wins when it changes from outside
 *
 * The text is local, seeded from the applied search, and takes the applied
 * search again whenever that changes elsewhere: the empty state's Clear
 * search, or a new server render.
 */
export function FoundSearchBox({
  placeName,
  search,
  keep,
  onSearch,
  onClear,
}: {
  placeName: string;
  /** The search applied now, or none. */
  search: FoundSearch | null;
  /** The address's other parameters, for a search sent before the page hydrated. */
  keep: readonly (readonly [string, string])[];
  /** What was typed, sent. The caller decides whether it is a search. */
  onSearch: (typed: string) => void;
  onClear: () => void;
}) {
  const applied = search?.q ?? "";
  const [typed, setTyped] = useState(applied);
  const [shown, setShown] = useState(applied);
  if (applied !== shown) {
    setShown(applied);
    setTyped(applied);
  }

  const box = useRef<HTMLInputElement>(null);
  useChangedBeforeHydration(box, ([field]) => setTyped(field.value));

  const clear = () => {
    setTyped("");
    onClear();
    // The button goes with the words, so the field takes the focus.
    box.current?.focus();
  };

  return (
    <form
      role="search"
      action="/"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(typed);
      }}
      className="flex items-center gap-2"
    >
      {keep.map(([name, value], index) => (
        <input
          key={`${name}:${index}`}
          type="hidden"
          name={name}
          value={value}
        />
      ))}
      <Field
        className="min-w-0 flex-1"
        label={foundWords.search.label(placeName)}
        labelHidden
        type="search"
        name="q"
        shape="pill"
        leading={<SearchIcon className="size-5" />}
        ref={box}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        maxLength={FOUND_Q_MAX}
        enterKeyHint="search"
        autoComplete="off"
      />
      <Button type="submit" variant="outline" className="shrink-0">
        {foundWords.search.submit}
      </Button>
      {typed.trim() !== "" || search ? (
        <Button variant="ghost" className="shrink-0" onClick={clear}>
          {foundWords.search.clear}
        </Button>
      ) : null}
    </form>
  );
}
