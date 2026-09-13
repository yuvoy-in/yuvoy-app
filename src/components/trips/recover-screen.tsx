"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { bookingUrl } from "@/lib/booking/token-store";
import { describeError, FailurePanel } from "@/components/states";
import { Field } from "@/components/ui/field";
import { PhoneField, DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/chrome/screen";

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
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
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
      /*
        Nothing is stored here: the response carries only the token, and a
        record needs the booking's key. The booking screen's first successful
        fetch keeps the fresh token under that key — which OVERWRITES the
        revoked one this recovery just retired, so the Trips card opens again.
      */
      if (data?.statusToken) router.replace(bookingUrl(data.statusToken));
    },
  });

  const failure = verify.error
    ? describeError(verify.error)
    : request.error
      ? describeError(request.error)
      : null;

  return (
    <Screen
      back={{ href: "/trips", label: "your trips" }}
      stageLabel="Your booking link"
    >
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Get your booking back
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        We will send a code to the number you booked with. Your booking link
        cannot be looked up any other way. It is not stored anywhere we can read
        it.
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
        {/*
          The same field the sign-in uses — yuvoy-app#34. It was free text with
          a `+91…` PLACEHOLDER, which is a hint rather than a value: it
          disappears on the first keystroke, so somebody typing their number
          sent it with no country code and the API refused it with a message
          about E.164. Recovery had the identical defect one screen away, so it
          gets the identical fix.
        */}
        <PhoneField
          label="WhatsApp number"
          value={phone}
          onChange={setPhone}
          disabled={sent}
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
              devCode ? `Development build: the code is ${devCode}.` : undefined
            }
          />
        ) : null}

        <Button
          type="submit"
          size="lg"
          block
          disabled={request.isPending || verify.isPending}
        >
          {request.isPending || verify.isPending
            ? "Working…"
            : sent
              ? "Open my booking"
              : "Send me a code"}
        </Button>
      </form>

      {sent && !failure ? (
        <p className="text-forest/70 mt-4 text-xs" role="status">
          If that number has a booking with us, a code is on its way. We answer
          the same way for every number, so this is not a way to check whether
          somebody has booked.
        </p>
      ) : null}

      {failure ? <FailurePanel failure={failure} className="mt-6" /> : null}

      {/*
        The way back, once a code has been asked for. A code that never
        arrives, or a number typed wrong, used to be a reload-the-page dead
        end: the field was disabled and the only button was "Open my
        booking". Asking again is rate-limited server-side, and answered the
        same way for every number.
      */}
      {sent ? (
        <p className="text-forest/70 mt-4 text-xs">
          No code yet?{" "}
          <button
            type="button"
            onClick={() => {
              setCode("");
              verify.reset();
              request.mutate();
            }}
            disabled={request.isPending}
            className="text-terra-deep tap-target underline disabled:opacity-40"
          >
            Send another one
          </button>
          {" · "}
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setDevCode(undefined);
              request.reset();
              verify.reset();
            }}
            className="text-terra-deep tap-target underline"
          >
            Use a different number
          </button>
        </p>
      ) : null}

      <p className="text-forest/70 mt-8 text-xs">
        A new link replaces the old one. If you find the old message later, it
        will no longer open.
      </p>
    </Screen>
  );
}
