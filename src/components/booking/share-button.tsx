"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { describeError, FailurePanel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ShareIcon } from "@/components/ui/icons";

/**
 * A link for the people coming with you.
 *
 * Mints a token SEPARATE from the status token, and the shared view carries no
 * payer details. Four friends on a dive should see the meeting point and the
 * time without seeing each other's money — and without being able to cancel
 * the booking, which the status token would let them do.
 */
export function ShareButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

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
    onSuccess: async (data) => {
      if (!data?.shareUrl) return;
      // Native share where it exists — on a phone that is what people expect,
      // and it avoids a clipboard permission prompt.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ url: data.shareUrl, title: "Our trip" });
          return;
        } catch {
          // Dismissed. Fall through to copying.
        }
      }
      try {
        await navigator.clipboard.writeText(data.shareUrl);
        setCopied(true);
      } catch {
        // Clipboard refused: the URL is shown below either way.
      }
    },
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
            {copied ? "Copied. " : ""}
            {share.data.reveals ??
              "This link shows the meeting point and the time. It does not show what anyone paid, and it cannot cancel the booking."}
          </p>
          <p className="text-forest/70 mt-2 font-mono text-xs break-all">
            {share.data.shareUrl}
          </p>
        </div>
      ) : null}

      {failure ? <FailurePanel failure={failure} className="mt-3" /> : null}
    </div>
  );
}
