import type { components, operations } from "@/lib/api/schema.gen";

/**
 * The shapes Me reads (yuvoy-mobile#444; yuvoy-api#467, #469, #504), taken
 * from the pinned contract so a change there shows up here as a type error
 * rather than as a blank card.
 */

/** One thing the person did, with the record it came from (`proof`). */
export type LifeEntry = components["schemas"]["LifeEntry"];

/** A badge they hold, naming the entries that earned it (`evidence`). */
export type Badge = components["schemas"]["Badge"];

/** A badge on its way: `have` of `need`, and a season's last day. */
export type BadgeProgress = components["schemas"]["BadgeProgress"];

/** `GET /me/settings`, of which Me shows `languages` and `showWomenOnlyTables`. */
export type MySettings = components["schemas"]["MySettings"];

/** One page of `GET /me/life-list`. */
export type LifeListPage =
  operations["getMyLifeList"]["responses"][200]["content"]["application/json"];

/** `GET /me/badges`. */
export type MyBadges =
  operations["getMyBadges"]["responses"][200]["content"]["application/json"];

/** A "Did you go?" question the first page of the life list carries. */
export type DidYouGoItem = {
  eventId: string;
  title: string;
  startsAt: string;
};

/** Who sees an entry. A plan is always `only_me`. */
export type EntryVisibility = "only_me" | "friends";

/** The four languages a person can say they are happy with. */
export type MeLanguage = "en" | "hi" | "te" | "kn";
