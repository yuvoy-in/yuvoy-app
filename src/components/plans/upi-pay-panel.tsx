"use client";

import { useEffect, useState } from "react";
import { checkedPayLink } from "@/lib/plans/pay-link";
import { rupees } from "@/lib/plans/format";
import type { PlanPayee } from "@/lib/plans/types";
import { planWords } from "@/lib/plans/words";
import { Button, buttonVariants } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";

/**
 * Paying one share by UPI (yuvoy-app#193, R7-c section 3).
 *
 * ## The text is always there; the button only when it agrees
 *
 * The amount and the UPI ID are drawn as text whatever happens, from the
 * share and `payee`: not every UPI app opens a `upi://pay` link (the
 * contract says so), and somebody can always pay by hand from those two.
 *
 * The button is drawn only when `checkedPayLink` passes: the link the API
 * sent pays exactly the UPI ID and the amount printed beside it. Otherwise
 * there is no button and the text says how to pay by hand. The page never
 * writes a link of its own: one it built would have nothing to be checked
 * against, which is the whole of the check.
 *
 * The payee's name is shown too, so somebody can see their UPI app is about
 * to pay the person they think. Yuvoy does not take, hold or see the money,
 * and the line under the button says so.
 */
export function UpiPayPanel({
  share,
  payLink,
  payee,
  payer,
}: {
  /** This reader's share, in paise. */
  share: number;
  payLink: string | undefined;
  payee: PlanPayee | undefined;
  /** First name of whoever paid, the person this money goes to. */
  payer: string;
}) {
  const amount = rupees(share);
  if (!payee) {
    return (
      <p className="text-forest/70 mt-2 text-sm">
        {planWords.noPayeeYet(payer)}
      </p>
    );
  }
  const link = checkedPayLink(payLink, payee, share);

  return (
    <div className="mt-3">
      {link ? (
        <>
          <a
            href={link}
            className={buttonVariants({ variant: "primary", size: "md" })}
          >
            {planWords.payButton(amount)}
          </a>
          <p className="text-forest/70 mt-2 text-sm text-pretty">
            {planWords.underPayButton(payer, amount)}
          </p>
          <p className="mt-2 text-sm">
            {planWords.payFallback(amount, payee.upiId)}
          </p>
        </>
      ) : (
        <p className="text-sm">{planWords.payByHand(amount, payee.upiId)}</p>
      )}
      <p className="text-forest/70 mt-1 text-sm">
        {planWords.payeeName(payee.name)}
      </p>
      <CopyUpiId upiId={payee.upiId} />
    </div>
  );
}

/**
 * Copy the UPI ID, for an app that will not open the link. "Copied" only once
 * the clipboard took it, and for two seconds, as `LinkActions` does.
 */
function CopyUpiId({ upiId }: { upiId: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-2"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(upiId);
            setCopied(true);
          } catch {
            // Refused (no permission, no secure context). Nothing is claimed;
            // the UPI ID is on screen to copy by hand.
          }
        })();
      }}
    >
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
      {copied ? planWords.copied : planWords.copyUpiId}
    </Button>
  );
}
