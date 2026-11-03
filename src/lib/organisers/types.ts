import type { components, operations } from "@/lib/api/schema.gen";

/**
 * The organiser shapes as the contract generates them (yuvoy-app#224, the web
 * half of yuvoy-mobile#393, and the group setup of yuvoy-app#225, the web half
 * of yuvoy-mobile#395). Named here once so the helpers, the hooks and the
 * screens all read the same types.
 */

type S = components["schemas"];

export type Organiser = S["Organiser"];
export type OrganiserInput = S["OrganiserInput"];
/**
 * `createOrganiser`'s body for a group the caller holds (yuvoy-app#225): the
 * name and place are the group's, so `name` and `destinationKey` are not sent.
 */
export type OrganiserFromClubInput = S["OrganiserFromClubInput"];
export type OrganiserLink = S["OrganiserLink"];
export type OrganiserLinkKind = OrganiserLink["kind"];
export type OrganiserState = Organiser["state"];
export type OrganiserRole = Organiser["role"];
export type OrganiserEvent = S["OrganiserEvent"];
export type OrganiserEventInput = S["OrganiserEventInput"];
export type OrganiserEventState = OrganiserEvent["state"];
export type OrganiserEventNumbers = S["OrganiserEventNumbers"];
/** A helper as `addOrganiserHelper` answers it. */
export type OrganiserHelper = S["OrganiserHelper"];
/** A helper as `listOrganiserHelpers` lists it: `travellerId` goes to an owner only. */
export type OrganiserHelperListed = S["OrganiserHelperListed"];

type MyOrganisersAnswer =
  operations["listMyOrganisers"]["responses"][200]["content"]["application/json"];

/**
 * A group (an R9 club) the caller's approved claim holds, shown, with no
 * organiser yet. The contract writes it inline in `listMyOrganisers`, so it is
 * named here. `category` is the group's category key, for the form to
 * pre-tick, or null.
 */
export type ClubToLink = MyOrganisersAnswer["clubsToLink"][number];

/**
 * `listMyOrganisers` as the hub reads it: the person's organisers, oldest
 * first, and the groups they may set up an organiser for, by name (empty for
 * a person whose People use is paused or ended).
 */
export type MyOrganisers = { items: Organiser[]; clubsToLink: ClubToLink[] };
