"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createApiClient, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/**
 * "Need help?" on the booking page and on Account (yuvoy-app#38 items 4 and 9).
 *
 * One component for both, because they are the same two routes to a person and
 * differed only in what they attach. The booking page has a reference and a
 * status token; Account has a session and no reference.
 *
 * ## Two routes, and only one of them is ours
 *
 * **WhatsApp** is where the conversation actually happens, and it is first
 * because a traveller with a problem on a jetty wants a person, not a form.
 * It opens a thread with the message already written, so nobody has to explain
 * which booking they mean.
 *
 * **The form** is the fallback for somebody with no WhatsApp, or with the
 * patience to type. It answers with a reference, which is the thing that makes
 * a support request feel handled rather than swallowed.
 *
 * ## The number can be absent, and then there is no button
 *
 * `support.whatsappE164` is "null while there is no support number, and the
 * button is hidden then". A "Chat with us" that opens nothing is worse than no
 * chat at all, and this product has shipped an unconfigured number before.
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

export interface HelpSupport {
  whatsappE164?: string | null;
  hours?: string | null;
}

export function HelpSection({
  support,
  bookingReference,
  whatsappMessage,
  token,
  className,
}: {
  support: HelpSupport | undefined;
  /** Attached to the request. Absent on Account, and on an unanswered request. */
  bookingReference?: string | null;
  /** What the WhatsApp thread opens with, already written. */
  whatsappMessage: string;
  /**
   * A booking link's status token, when there is one.
   *
   * With it the request goes straight to the API bearing the token, which is
   * what lets somebody who booked without signing in ask for help at all.
   * Without it the request goes through this app's own server, which holds the
   * session in an HttpOnly cookie that no browser code can read (app#57).
   */
  token?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const number = support?.whatsappE164?.trim();
  /*
    `wa.me` takes the number with no plus and no punctuation. Stripping
    everything but digits is deliberate rather than trimming a leading `+`: the
    field is E.164 by contract, and a stray space or dash in the data would
    otherwise produce a URL that opens WhatsApp on an empty search.
  */
  const digits = number ? number.replace(/\D+/g, "") : "";
  const waHref = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return (
    <section className={cn("mt-8", className)} aria-labelledby="help-heading">
      <h2 id="help-heading" className="label text-forest/75">
        Need help?
      </h2>

      <Panel className="mt-3">
        {waHref ? (
          <>
            {/*
              `rel="noopener"` because `target="_blank"` otherwise hands the
              opened page a live `window.opener` back to this one, and this one
              is a booking. `noreferrer` keeps the booking URL, token and all,
              out of the referrer header.
            */}
            <ButtonLink
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              block
            >
              Chat with us
            </ButtonLink>
            {support?.hours ? (
              <p className="text-forest/70 mt-2 text-xs">{support.hours}</p>
            ) : null}
          </>
        ) : null}

        <Button
          variant="outline"
          block
          onClick={() => setOpen(true)}
          className={waHref ? "mt-3" : undefined}
        >
          Send us a message
        </Button>
      </Panel>

      {open ? (
        <MessageSheet
          onClose={() => setOpen(false)}
          bookingReference={bookingReference}
          token={token}
        />
      ) : null}
    </section>
  );
}

function MessageSheet({
  onClose,
  bookingReference,
  token,
}: {
  onClose: () => void;
  bookingReference?: string | null;
  token?: string | null;
}) {
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
                  ? "border-forest bg-forest text-cream"
                  : "border-cream-line bg-cream text-forest hover:border-forest/40",
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
          className="rounded-control border-cream-line bg-cream focus:border-forest/60 ease-interaction mt-2 w-full border px-4 py-3 text-base transition-colors duration-200 outline-none"
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
