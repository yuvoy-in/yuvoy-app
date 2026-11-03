import {
  emptyOrganiserForm,
  organiserInput,
  type OrganiserPageForm,
} from "./organisers";
import type { ClubToLink, OrganiserFromClubInput } from "./types";
import { ORGANISER_DEPARTMENTS } from "./words";

/**
 * A group's page, as the form starts and sends it (yuvoy-app#225). Split out
 * of `organisers.ts` to keep it short.
 */

/**
 * The setup form for a group the person holds (yuvoy-app#225): #224's empty
 * form with the group's name and place, and the group's category ticked when
 * it is a key of `ORGANISER_DEPARTMENTS`, the app's own list. A category
 * outside that list is left unticked, even when the vocabulary offers it.
 */
export function clubPageForm(club: ClubToLink): OrganiserPageForm {
  const { category } = club;
  return {
    ...emptyOrganiserForm(club.destinationKey),
    name: club.name,
    departments:
      category !== null && Object.hasOwn(ORGANISER_DEPARTMENTS, category)
        ? [category]
        : [],
  };
}

/**
 * `createOrganiser`'s body for a group: the form's fields as `organiserInput`
 * sends them, with the group's `clubId` and without its name and place, which
 * the API takes from the group (a body that sends either is 400).
 */
export function clubOrganiserInput(
  form: OrganiserPageForm,
  clubId: string,
): OrganiserFromClubInput {
  const page = organiserInput(form);
  const body: OrganiserFromClubInput = {
    clubId,
    departments: page.departments,
    runsIt: true,
  };
  if (page.about !== undefined) body.about = page.about;
  if (page.links !== undefined) body.links = page.links;
  if (page.contactEmail !== undefined) body.contactEmail = page.contactEmail;
  return body;
}
