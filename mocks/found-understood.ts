import type { components } from "../src/lib/api/schema.gen";
import { BENGALURU, COORG } from "./found-fixtures";

/**
 * What the words of a found-items search are taken to mean (yuvoy-app#180),
 * as the API reads them (yuvoy-api `found_items_understood.go`, R3-T2): a
 * word list, never a guess. Department words are consumed; activity words
 * give their department's chip and stay in the text; day words in English
 * and romanised Hindi, Telugu and Kannada; `free`; and the names of the
 * places the caller may see. A word in `asText` is plain text and never a
 * chip. One kind ORs within itself, kinds AND. The place being searched is
 * dropped from the text; another place gives a chip that never narrows.
 *
 * The same list as mobile's twin (yuvoy-mobile
 * `packages/mocks/src/found-understood.ts`), with the web's two places.
 */

type UnderstoodChip = components["schemas"]["UnderstoodChip"];

/** The API's department names (`CategoryLabels`), the chip's words. */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  adventure: "Adventure",
  nature_wildlife: "Nature and wildlife",
  food_drink: "Food and drink",
  arts_creativity: "Arts and creativity",
  learning: "Learning",
  culture_heritage: "Culture and heritage",
  wellness: "Wellness",
  entertainment: "Entertainment",
  community: "Community",
  sports: "Sports",
  local_life: "Local life",
  events: "Events",
};

/** A word of the list: what it means, and whether it stays in the text. */
interface Meaning {
  kind: UnderstoodChip["kind"];
  value: string;
  label: string;
  weekday?: number;
  keep?: boolean;
}

const DEPARTMENT_WORDS: Record<string, string[]> = {
  adventure: ["adventure"],
  nature_wildlife: ["nature", "wildlife"],
  food_drink: ["food", "drink", "drinks"],
  arts_creativity: ["art", "arts", "creative"],
  learning: ["learning"],
  culture_heritage: ["culture", "cultural", "heritage"],
  wellness: ["wellness"],
  entertainment: ["entertainment"],
  community: ["community"],
  sports: ["sport", "sports"],
};

const ACTIVITY_WORDS: Record<string, string[]> = {
  adventure: [
    "dive",
    "diving",
    "scuba",
    "snorkeling",
    "snorkelling",
    "trek",
    "trekking",
    "hike",
    "hiking",
    "kayak",
    "kayaking",
    "rafting",
    "climbing",
  ],
  entertainment: [
    "comedy",
    "standup",
    "music",
    "concert",
    "gig",
    "film",
    "movie",
  ],
  events: ["festival", "fest"],
  local_life: ["market", "flea"],
  wellness: ["yoga", "meditation"],
  arts_creativity: ["pottery", "painting", "craft", "crafts", "exhibition"],
  learning: ["workshop", "class", "talk"],
  culture_heritage: ["museum", "history"],
  community: ["volunteer", "meetup", "cleanup"],
  sports: ["cricket", "football", "running", "cycling"],
  nature_wildlife: ["birding", "safari"],
  food_drink: ["brunch", "tasting"],
};

const DAY_WORDS: Record<string, string[]> = {
  today: ["today", "aaj", "eeroju", "indu"],
  tomorrow: ["tomorrow", "tmrw", "tomorow", "tommorow", "repu", "naale"],
  weekend: ["weekend", "weekends", "wknd"],
};
const DAY_LABELS: Record<string, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
};

/** By ISO weekday, Monday first. sat, sun, mon and wed are left out, as the API leaves them. */
const WEEKDAYS: [string, string[]][] = [
  ["monday", ["monday", "somvar", "somvaar", "somavaram", "somavara"]],
  [
    "tuesday",
    [
      "tuesday",
      "tue",
      "tues",
      "mangalvar",
      "mangalvaar",
      "mangalavaram",
      "mangalavara",
    ],
  ],
  [
    "wednesday",
    ["wednesday", "budhvar", "budhvaar", "budhavaram", "budhavara"],
  ],
  [
    "thursday",
    [
      "thursday",
      "thu",
      "thurs",
      "guruvar",
      "guruvaar",
      "guruvaram",
      "guruvara",
    ],
  ],
  [
    "friday",
    ["friday", "fri", "shukravar", "shukravaar", "shukravaram", "shukravara"],
  ],
  [
    "saturday",
    [
      "saturday",
      "shanivar",
      "shanivaar",
      "shanivaram",
      "sanivaram",
      "shanivara",
    ],
  ],
  [
    "sunday",
    [
      "sunday",
      "ravivar",
      "ravivaar",
      "itvar",
      "itvaar",
      "aadivaram",
      "adivaram",
      "bhanuvara",
      "ravivara",
    ],
  ],
];

const FILLERS = new Set(
  "this next coming upcoming the in on at near for to do what whats events event things activities something happening".split(
    " ",
  ),
);
const STOPWORDS = new Set(
  "an and any are am is was be of or by with from it its me my we you there here which where when how all some can now".split(
    " ",
  ),
);

/** The places a search may name, by name and alias (the API's `destinations.aliases`). */
const PLACE_WORDS: Readonly<Record<string, { name: string; words: string[] }>> =
  {
    [BENGALURU]: {
      name: "Bengaluru",
      words: ["bengaluru", "bangalore", "blr"],
    },
    [COORG]: { name: "Coorg", words: ["coorg", "kodagu"] },
  };

const MEANINGS: ReadonlyMap<string, Meaning> = (() => {
  const words = new Map<string, Meaning>();
  const put = (word: string, meaning: Meaning) => {
    if (words.has(word)) {
      throw new Error(`found-understood: "${word}" is listed twice`);
    }
    words.set(word, meaning);
  };
  const label = (key: string) => CATEGORY_LABELS[key] ?? key;
  for (const [key, list] of Object.entries(DEPARTMENT_WORDS)) {
    for (const w of list) {
      put(w, { kind: "department", value: key, label: label(key) });
    }
  }
  for (const [key, list] of Object.entries(ACTIVITY_WORDS)) {
    for (const w of list) {
      put(w, { kind: "department", value: key, label: label(key), keep: true });
    }
  }
  for (const [key, list] of Object.entries(DAY_WORDS)) {
    for (const w of list) {
      put(w, { kind: "when", value: key, label: DAY_LABELS[key]! });
    }
  }
  WEEKDAYS.forEach(([name, list], i) => {
    const day = name[0]!.toUpperCase() + name.slice(1);
    for (const w of list) {
      put(w, { kind: "when", value: name, label: day, weekday: i + 1 });
    }
  });
  put("free", { kind: "free", value: "true", label: "Free" });
  return words;
})();

/** Words as the API reads them: lower case, an inner apostrophe joined, split on the rest. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([\p{L}\p{M}\p{N}])['’]([\p{L}\p{M}\p{N}])/gu, "$1$2")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

const emptyWord = (w: string) =>
  [...w].length === 1 || STOPWORDS.has(w) || FILLERS.has(w);

/** What the chips narrow: one kind ORs within itself, kinds AND. */
export interface Narrowing {
  departments: string[];
  days: string[];
  /** ISO weekdays, 1 Monday to 7 Sunday. */
  weekdays: number[];
  free: boolean;
}

export interface Understood {
  chips: UnderstoodChip[];
  narrowing: Narrowing;
  /** The words left for the text search. */
  text: string[];
  /** Only this place's own name was typed: the answer is as if nothing were. */
  ownPlaceOnly: boolean;
  /** Nothing narrows and no text is left (another place alone, or only empty words). */
  nothing: boolean;
}

/** Reads `q` as the API does, for a search in `hereKey`. */
export function understand(
  q: string,
  asText: readonly string[],
  hereKey: string,
): Understood {
  const tokens = searchWords(q);
  const plain = new Set(asText.flatMap((w) => searchWords(w)));
  const chips: UnderstoodChip[] = [];
  const seen = new Set<string>();
  const rest: string[] = [];
  const narrowing: Narrowing = {
    departments: [],
    days: [],
    weekdays: [],
    free: false,
  };
  let own = 0;
  let other = 0;
  const add = (chip: UnderstoodChip): boolean => {
    const id = `${chip.kind}:${chip.value}`;
    if (seen.has(id) || chips.length >= 12) return false;
    seen.add(id);
    chips.push({ ...chip, from: [...chip.from].slice(0, 40).join("") });
    return true;
  };
  for (const word of tokens) {
    if (plain.has(word)) {
      rest.push(word);
      continue;
    }
    const place = Object.keys(PLACE_WORDS).find((key) =>
      PLACE_WORDS[key]!.words.includes(word),
    );
    if (place) {
      if (place === hereKey) own += 1;
      else if (
        add({
          kind: "place",
          value: place,
          label: PLACE_WORDS[place]!.name,
          from: word,
        })
      ) {
        other += 1;
      }
      continue;
    }
    if (FILLERS.has(word)) continue;
    const meaning = MEANINGS.get(word);
    if (!meaning) {
      rest.push(word);
      continue;
    }
    const fresh = add({
      kind: meaning.kind,
      value: meaning.value,
      label: meaning.label,
      from: word,
    });
    if (meaning.keep) rest.push(word);
    if (!fresh) continue;
    if (meaning.kind === "department") {
      narrowing.departments.push(meaning.value);
    } else if (meaning.kind === "when" && meaning.weekday) {
      narrowing.weekdays.push(meaning.weekday);
    } else if (meaning.kind === "when") {
      narrowing.days.push(meaning.value);
    } else if (meaning.kind === "free") {
      narrowing.free = true;
    }
  }
  const narrows =
    narrowing.departments.length > 0 ||
    narrowing.days.length > 0 ||
    narrowing.weekdays.length > 0 ||
    narrowing.free;
  const text = rest.filter((w) => !emptyWord(w));
  const nothingElse =
    rest.length === 0 && !chips.some((c) => c.kind !== "place");
  const ownPlaceOnly = nothingElse && own > 0 && other === 0;
  return {
    chips,
    narrowing,
    text,
    ownPlaceOnly,
    nothing: !ownPlaceOnly && !narrows && text.length === 0,
  };
}

/** One letter away (a change, an extra or a missing letter), for a word of four or more. */
function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Whether every word of the text is found in the card's own words: it starts
 * one, or is one letter away from one (a misspelling the API's trigram arm
 * finds).
 */
export function textMatches(
  text: readonly string[],
  cardWords: readonly string[],
): boolean {
  return text.every((w) =>
    cardWords.some(
      (d) => d.startsWith(w) || ([...w].length >= 4 && near(w, d)),
    ),
  );
}
