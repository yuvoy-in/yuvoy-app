import type { components } from "@/lib/api/schema.gen";

/**
 * The organiser shapes as the contract generates them (yuvoy-app#224, the web
 * half of yuvoy-mobile#393). Named here once so the helpers, the hooks and the
 * screens all read the same types.
 */

type S = components["schemas"];

export type Organiser = S["Organiser"];
export type OrganiserInput = S["OrganiserInput"];
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
