"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { RequestStatus } from "./request-status";

/**
 * The message form, lifted out of `help-section` so two surfaces share it.
 *
 * The Help Center and a booking both need it and they attach different things:
 * a booking carries a status token and a reference, the Help Center carries a
 * session and neither. One component, because two copies of a form that talks
 * to `POST /support/requests` would drift on the day its validation changes.
 *
 * ## Why the booking page cannot simply link here
 *
 * The token. `createSupportRequest` accepts a booking link's status token as
 * well as a session, and that is what lets somebody who booked WITHOUT signing
 * in ask for help at all. The token lives in the URL fragment of the booking
 * page and does not survive a navigation, so a guest sent to `/help` would
 * arrive unable to send anything. The sheet goes to them instead.
 *
 * ## What it does not pretend to be
 *
 * A conversation. The reply comes on WhatsApp, and the API stores the
 * traveller's own message and no staff replies. Since yuvoy-api#196 it does
 * store where a request is, so the receipt offers that and nothing more: the
 * reference, a way to check its status, and where the answer will come from.
 */
const TOPICS = [
  { key: "booking", label: "Booking" },
  { key: "payment", label: "Payment" },
  { key: "cancellation", label: "Cancellation" },
  { key: "other", label: "Other" },
] as const;

type Topic = (typeof TOPICS)[number]["key"];

/** The contract's own bounds. Enforced here so the API never has to say no. */
const MIN = 10;
const MAX = 2000;

export function MessageSheet({
  onClose,
  bookingReference,
  token,
  onSent,
}: {
  onClose: () => void;
  bookingReference?: string | null;
  token?: string | null;
  /**
   * Told the reference once the request is in, so the screen behind the
   * sheet can keep showing it after the sheet is closed. A reference that
   * vanishes with a dialog is the "swallowed" feeling the receipt exists to
   * prevent.
   */
  onSent?: (reference: string) => void;
}) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState<Topic>("other");
  const [message, setMessage] = useState("");
  /** Set only after a submit, so the field does not scold while being typed. */
  const [tried, setTried] = useState(false);

  const send = useMutation({
    retry: false,
    mutationFn: async () => {
      const body = {
        message: message.trim(),
        topic,
        ...(bookingReference ? { bookingReference } : {}),
      };
      if (token) {
        const client = createApiClient();
        const { data, error } = await client.POST("/support/requests", {
          headers: { Authorization: `Bearer ${token}` },
          body,
        });
        if (error) throw error;
        return data;
      }
      const client = createProxyClient();
      const { data, error } = await client.POST("/support/requests", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      /*
        The Help Center's list is this number's requests, and it now has one
        more. Invalidated rather than appended to: the API may have answered
        with an EXISTING reference ("resubmitting the same message about the
        same booking returns the same reference") and reopened it, which only
        the server's own list can show correctly.
      */
      void queryClient.invalidateQueries({ queryKey: qk.supportRequests() });
      if (data?.reference) onSent?.(data.reference);
    },
  });

  const trimmed = message.trim();
  const tooShort = trimmed.length < MIN;

  /*
    The API's field-level complaints, under the field they are about.

    `details` is the envelope's map of field to sentence. Rendering it wholesale
    at the top of a form is the usual shortcut and it is the wrong one: a
    traveller reads the sentence, then has to work out which box it meant.
  */
  const details =
    send.error instanceof YuvoyError &&
    send.error.details &&
    typeof send.error.details === "object"
      ? (send.error.details as Record<string, string>)
      : {};

  const rateLimited =
    send.error instanceof YuvoyError && send.error.status === 429;

  if (send.data) {
    return (
      <Sheet open onClose={onClose} title="Send us a message">
        <div role="status">
          <p className="text-sm">{send.data.message}</p>
          {/*
            The reference, and it is the point. A support request with no
            receipt feels swallowed; this is "short enough to quote on a call",
            which is exactly what somebody chasing it will do.
          */}
          <p className="mt-3 font-mono text-sm tracking-wider">
            Reference {send.data.reference}
          </p>
        </div>
        {/*
          And since yuvoy-api#196, a way to see where it is: on demand, with
          the same credential that sent it (the booking's status token on a
          booking page, the session anywhere else). Outside the status region
          above, because a live region is for the receipt, not for a control.
        */}
        <RequestStatus
          reference={send.data.reference}
          token={token}
          showReference={false}
          className="mt-1"
        />
        {/*
          WHERE THE ANSWER COMES FROM, said plainly, and it has not changed.
          The status says where the request is; the reply itself still comes
          on WhatsApp and is never shown in the app, so nothing here may read
          as though it will be.
        */}
        <p className="text-forest/70 mt-3 text-sm">
          A person replies on WhatsApp, to the number you used.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Send us a message"
      footer={
        <Button
          block
          disabled={send.isPending}
          onClick={() => {
            setTried(true);
            if (tooShort || trimmed.length > MAX) return;
            send.mutate();
          }}
        >
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      }
    >
      <fieldset>
        <legend className="label text-forest/75">What is it about?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOPICS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={topic === option.key}
              onClick={() => setTopic(option.key)}
              className={cn(
                "rounded-control ease-interaction tap-target border px-3 py-2 text-sm transition-colors duration-200",
                topic === option.key
                  ? "border-forest bg-forest text-paper"
                  : "border-paper-line bg-paper text-forest hover:border-forest/40",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="label text-forest/75">Your message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={MAX}
          aria-invalid={(tried && tooShort) || Boolean(details.message)}
          className="rounded-control border-paper-line bg-paper focus:border-forest/60 ease-interaction mt-2 w-full border px-4 py-3 text-base transition-colors duration-200 outline-none"
        />
      </label>

      {/*
        The floor, said before it is hit rather than after. Ten characters is
        the contract's `minLength`, and a form that accepts "help" and then
        refuses it has wasted a round trip on island signal.
      */}
      {details.message ? (
        <p role="alert" className="text-terra-deep mt-2 text-sm">
          {details.message}
        </p>
      ) : tried && tooShort ? (
        <p role="alert" className="text-terra-deep mt-2 text-sm">
          Tell us a little more, at least {MIN} characters.
        </p>
      ) : (
        <p className="text-forest/70 mt-2 text-xs">
          At least {MIN} characters, so we know what to look at.
        </p>
      )}

      {Object.entries(details)
        .filter(([field]) => field !== "message")
        .map(([field, sentence]) => (
          <p key={field} role="alert" className="text-terra-deep mt-2 text-sm">
            {sentence}
          </p>
        ))}

      {rateLimited ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          That is 5 messages this hour. Try again later.
        </p>
      ) : send.error && Object.keys(details).length === 0 ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          {send.error instanceof YuvoyError
            ? send.error.message
            : "That did not send. Try again."}
        </p>
      ) : null}
    </Sheet>
  );
}
