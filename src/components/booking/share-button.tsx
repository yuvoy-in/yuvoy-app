"use client";

import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { describeError, FailurePanel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ShareIcon } from "@/components/ui/icons";
import { LinkActions } from "@/components/ui/link-actions";

/**
 * A link for the people coming with you.
 *
 * Mints a token SEPARATE from the status token, and the shared view carries no
 * payer details. Four friends on a dive should see the meeting point and the
 * time without seeing each other's money — and without being able to cancel
 * the booking, which the status token would let them do.
 */
export function ShareButton({ token }: { token: string }) {
  const share = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/share", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    /*
      No automatic share or copy on success any more (yuvoy-app#38 item 8).

      Minting the link used to fire `navigator.share` itself, which put a
      system sheet on the screen as the RESULT of pressing "Share with the
      people coming" rather than as a second, deliberate act. When that was
      dismissed it silently copied instead, so a traveller who changed their
      mind still had a booking link on their clipboard.

      The link is minted, then offered. Two taps, and the second one is the
      one that hands it over.
    */
  });

  // Token-bearing: a 401 here is the booking link dying, not a share problem.
  const failure = share.error
    ? describeError(share.error, { tokenBearing: true })
    : null;

  return (
    <div className="mt-6">
      <Button
        variant="outline"
        block
        onClick={() => share.mutate()}
        disabled={share.isPending}
      >
        <ShareIcon className="size-4" />
        {share.isPending ? "Making a link…" : "Share with the people coming"}
      </Button>

      {share.data?.shareUrl ? (
        <div className="mt-3">
          <p className="text-forest/70 text-xs">
            {share.data.reveals ??
              "This link shows the meeting point and the time. It does not show what anyone paid, and it cannot cancel the booking."}
          </p>
          {/*
            The link as two actions, never as text. See `LinkActions` for why:
            the short version is that a printed URL is unreadable, is a
            screenshot away from a stranger, and teaches people to treat our
            credentials as ordinary text.
          */}
          <LinkActions
            url={share.data.shareUrl}
            title="Our trip"
            className="mt-3"
          />
        </div>
      ) : null}

      {failure ? <FailurePanel failure={failure} className="mt-3" /> : null}
    </div>
  );
}
