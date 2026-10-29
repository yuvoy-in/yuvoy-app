import type { components } from "@/lib/api/schema.gen";
import { checkedPayLink } from "./pay-link";
import type { PlanPayee } from "./types";

/**
 * A guest's unsettled shares on earlier weeks of a weekly plan
 * (`PlanView.earlierShares`, yuvoy-mobile#373 case 11).
 *
 * ## Each share is checked against its own week, never this one
 *
 * An earlier week's share is paid to whoever was the payee THAT week. The
 * planner may have changed the UPI ID since, so this week's `payee` says
 * nothing about where last week's money goes, and checking last week's link
 * against it would pass a link to the wrong person whenever the two happen
 * to agree and refuse a right one whenever they do not. So each share's
 * `payLink` goes through `checkedPayLink` with that share's own payee and
 * that share's own amount.
 *
 * The contract at ad4fa894 sends no payee with an earlier share
 * (`PlanEarlierShare` has `payLink` and nothing to check it against; the
 * API builds the link from that week's row and keeps the UPI ID to itself).
 * With no payee there is nothing the link can be checked against, so
 * `checkedPayLink` refuses it and no button is drawn: the share, the amount
 * and who to ask are still shown, and "I've paid this share" still works.
 * A `payee` on the share, if the API adds one, is read and checked like any
 * other, and then the button appears with no change here.
 *
 * ## Marking one paid
 *
 * A paid-only reply whose cost ids are all that week's, which the API files
 * against that week (`paidElsewhere`). `paid` is a complete set for the
 * plan it lands on, so it carries every share of that week already marked
 * as well as the new one: sending the new one alone would unmark the rest.
 * Never mixed with this week's ids, which the API refuses as a 404.
 */

type EarlierShare = components["schemas"]["PlanEarlierShare"];

/** A share, with the payee the API may one day send beside it. */
type ShareWithPayee = EarlierShare & { payee?: PlanPayee };

/**
 * The payee to pay this share to and check its link against: the share's
 * own, or none. Never this week's `plan.payee`.
 */
export function earlierPayee(share: EarlierShare): PlanPayee | undefined {
  const payee = (share as ShareWithPayee).payee;
  return typeof payee?.upiId === "string" &&
    payee.upiId !== "" &&
    typeof payee.name === "string"
    ? payee
    : undefined;
}

/**
 * The share's pay link when it pays exactly its own payee its own amount,
 * else null: what `UpiPayPanel` works out when handed `earlierPayee`.
 */
export function earlierPayLink(share: EarlierShare): string | null {
  return checkedPayLink(share.payLink, earlierPayee(share), share.amountMinor);
}

/** The shares, one group per week, in the order the API sent them. */
export function earlierWeeks(
  shares: readonly EarlierShare[] | undefined,
): { startsAt: string; shares: EarlierShare[] }[] {
  const weeks: { startsAt: string; shares: EarlierShare[] }[] = [];
  for (const share of shares ?? []) {
    const week = weeks.find((w) => w.startsAt === share.startsAt);
    if (week) week.shares.push(share);
    else weeks.push({ startsAt: share.startsAt, shares: [share] });
  }
  return weeks;
}

/**
 * The paid set to send to mark `costId` paid: every share of its week
 * already marked, and this one. Empty when `costId` is not one of them, so
 * a caller never sends a set that could land on this week's plan.
 */
export function paidForWeek(
  shares: readonly EarlierShare[] | undefined,
  costId: string,
): string[] {
  const share = shares?.find((s) => s.costId === costId);
  if (!share || !shares) return [];
  const week = shares.filter((s) => s.startsAt === share.startsAt);
  return [
    ...week.filter((s) => s.paidMarked && s.costId !== costId).map((s) => s.costId),
    costId,
  ];
}
