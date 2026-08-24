"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { bookingUrl } from "@/lib/booking/token-store";
import { describeError } from "@/components/states";
import { Field } from "@/components/ui/field";

/**
 * "I lost my link."
 *
 * The status token is returned exactly once and only its hash is stored, so it
 * genuinely cannot be looked up — not by us, not by support. This flow is the
 * only way back: an OTP to the phone that booked, then a FRESH token. The old
 * link stops working, which is the point rather than a side effect.
 *
 * The request step answers 202 for EVERY number, whether or not it booked.
 * That is deliberate — a different answer would turn this into a way to test
 * whether a given phone number has a Yuvoy booking.
 */
export function RecoverScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);

  const request = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/recovery/request", {
        body: { phone: phone.trim() },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSent(true);
      // Development only, and documented as such in the contract. Shown so the
      // flow is exercisable without an SMS account; it is never present in
      // production and nothing depends on it.
      setDevCode(data?.devCode);
    },
  });

  const verify = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/recovery/verify", {
        body: { phone: phone.trim(), code: code.trim() },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.statusToken) router.replace(bookingUrl(data.statusToken));
    },
  });

  const failure = verify.error
    ? describeError(verify.error)
    : request.error
      ? describeError(request.error)
      : null;

  return (
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-md py-8">
        <h1 className="font-display tracking-display text-3xl leading-tight">
          Get your booking back
        </h1>
        <p className="text-forest/70 mt-3 text-sm">
          We will send a code to the number you booked with. Your booking link
          cannot be looked up any other way — it is not stored anywhere we can
          read it.
        </p>

        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (sent) {
              verify.mutate();
            } else {
              request.mutate();
            }
          }}
        >
          <Field
            label="WhatsApp number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={sent}
            placeholder="+91…"
            autoComplete="tel"
            required
          />

          {sent ? (
            <Field
              label="The code we sent"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="font-mono"
              hint={
                devCode
                  ? `Development build — the code is ${devCode}.`
                  : undefined
              }
            />
          ) : null}

          <button
            type="submit"
            disabled={request.isPending || verify.isPending}
            className="rounded-edge label bg-forest text-cream h-13 w-full font-bold transition-transform active:scale-[0.99] disabled:opacity-40"
          >
            {request.isPending || verify.isPending
              ? "Working…"
              : sent
                ? "Open my booking"
                : "Send me a code"}
          </button>
        </form>

        {sent && !failure ? (
          <p className="text-forest/60 mt-4 text-xs" role="status">
            If that number has a booking with us, a code is on its way. We
            answer the same way for every number, so this is not a way to check
            whether somebody has booked.
          </p>
        ) : null}

        {failure ? (
          <div
            role="alert"
            className="rounded-edge border-terra-deep mt-6 border-l-2 p-4"
          >
            <p className="text-sm font-bold">{failure.title}</p>
            <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
            {failure.requestId ? (
              <p className="text-forest/40 mt-3 font-mono text-[10px]">
                {failure.requestId}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-forest/50 mt-8 text-xs">
          A new link replaces the old one. If you find the old message later, it
          will no longer open.
        </p>
      </div>
    </div>
  );
}
