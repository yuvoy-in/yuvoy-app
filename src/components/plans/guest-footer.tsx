"use client";

import { useState } from "react";
import type { GuestActions } from "@/lib/plans/guest-actions";
import { keepForSignIn, signInHref } from "@/lib/plans/guest-return";
import { planLinkFor, shareMessage, sharePlan } from "@/lib/plans/guest-share";
import { PLAN_SAFETY_EMAIL, guestWords } from "@/lib/plans/guest-words";
import type { PlanView } from "@/lib/plans/types";
import { planWords } from "@/lib/plans/words";
import { Button, ButtonLink } from "@/components/ui/button";
import { EarlierShares } from "./earlier-shares";

/** The line under "Link my reply to my account", once it has been tried. */
export interface LinkLine {
  tone: "done" | "problem";
  text: string;
}

/**
 * Everything under the plan on the guest page (yuvoy-mobile#373): last
 * week's shares, the reminder offer, Share, and the footer's privacy lines.
 *
 * ## Link my reply to my account
 *
 * Offered once this browser has a reply that is not an account's yet
 * (`me.linked` false). With a session it is one tap. Without one it is a
 * link to sign-in that keeps the token in this tab's storage first
 * (`keepForSignIn`) and names only `/p` and the page's own query as the way
 * back: the token goes in no address but the plan's own (case 15). The page
 * links the reply when it comes back (`GuestPlan`).
 *
 * ## The privacy lines
 *
 * The issue's footer. Its words carry privacy notice version
 * `PLAN_NOTICE_VERSION`, and wait on @gamallasaiteja and Hima with the
 * yuvoy.in privacy section before `plans` leaves staff. "The planner and the
 * others" is said with the planner's own first name. "Report this plan" is
 * the view's, beside "Remove my reply", so it is not drawn twice.
 */
export const PLAN_NOTICE_VERSION = "2026-11-r7";
export function GuestFooter({
  token,
  plan,
  actions,
  signedIn,
  linking,
  linkLine,
  onLink,
}: {
  token: string;
  plan: PlanView;
  actions: GuestActions;
  signedIn: boolean;
  linking: boolean;
  linkLine: LinkLine | null;
  onLink: () => void;
}) {
  const [shareProblem, setShareProblem] = useState(false);
  const offerLink = plan.me !== undefined && !plan.me.linked;

  async function share() {
    setShareProblem(false);
    const outcome = await sharePlan({
      title: plan.title,
      message: shareMessage(plan),
      link: planLinkFor(window.location.origin, token),
    });
    setShareProblem(outcome === "failed");
  }

  return (
    <footer className="mt-10 space-y-8">
      <EarlierShares plan={plan} actions={actions} />

      {offerLink || linkLine ? (
        <section className="space-y-3">
          {offerLink ? (
            <>
              <p className="text-pretty">{planWords.reminderOffer}</p>
              {signedIn ? (
                <Button
                  variant="outline"
                  pending={linking}
                  pendingLabel={planWords.sending}
                  onClick={onLink}
                >
                  {planWords.linkMyReply}
                </Button>
              ) : (
                <ButtonLink
                  variant="outline"
                  href={signInHref(window.location.search)}
                  onClick={() => keepForSignIn(token)}
                >
                  {planWords.linkMyReply}
                </ButtonLink>
              )}
            </>
          ) : null}
          <div role="status">
            {linkLine?.tone === "done" ? (
              <p className="text-sm">{linkLine.text}</p>
            ) : null}
          </div>
          {linkLine?.tone === "problem" ? (
            <p role="alert" className="text-terra-deep text-sm text-pretty">
              {linkLine.text}
            </p>
          ) : null}
        </section>
      ) : null}

      <div>
        <Button variant="outline" onClick={() => void share()}>
          {planWords.share}
        </Button>
        <div role="status">
          {shareProblem ? (
            <p className="text-terra-deep mt-2 text-sm text-pretty">
              {guestWords.shareFailed}
            </p>
          ) : null}
        </div>
      </div>

      <div
        data-notice-version={PLAN_NOTICE_VERSION}
        className="text-forest/70 border-paper-line space-y-2 border-t pt-6 text-sm"
      >
        <p className="text-pretty">{planWords.footerNoPhone}</p>
        <p className="text-pretty">{planWords.footerKept}</p>
        <p className="text-pretty">{planWords.footerSeen(plan.planner.name)}</p>
        <p className="text-pretty">
          {/* The sentence with the address left off, and the address as a link. */}
          {planWords.safety("")}
          <a
            href={`mailto:${PLAN_SAFETY_EMAIL}`}
            className="text-forest underline underline-offset-4"
          >
            {PLAN_SAFETY_EMAIL}
          </a>
        </p>
      </div>
    </footer>
  );
}
