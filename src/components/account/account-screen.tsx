"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import {
  getTravellerSession,
  saveTravellerSession,
  clearTravellerSession,
} from "@/lib/auth/traveller-session";
import { rememberBooking } from "@/lib/booking/token-store";
import { isDeadToken } from "@/lib/api/errors";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StateChip } from "@/components/booking/state-chip";
import { Screen } from "@/components/chrome/screen";
import {
  describeError,
  FailurePanel,
  Skeleton,
  LoadingState,
} from "@/components/states";

/**
 * T5 and T11 — and there is deliberately no account to create.
 *
 * The contract is explicit: "This is the whole of traveller accounts. There is
 * no signup, no password and no new secret: signing in is the same OTP that
 * already recovers a booking, and this is what it unlocks."
 *
 * So this screen does not offer a sign-up, and says so as its heading. A login
 * prompt in front of a stranger with a phone is the largest drop-off available
 * in this product, and none of this appears in the checkout path.
 */
export function AccountScreen() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  /** The sign-in's token died server-side; the form is back, and says why. */
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getTravellerSession().then((s) => {
      if (!cancelled) setToken(s?.token ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    onSuccess: async (data) => {
      if (!data?.statusToken) return;
      await saveTravellerSession(data.statusToken);
      setToken(data.statusToken);
    },
  });

  if (token === undefined) {
    return (
      <Screen>
        <LoadingState label="Checking this device">
          <Skeleton className="h-32 w-full" />
        </LoadingState>
      </Screen>
    );
  }

  if (token) {
    return (
      <SignedIn
        token={token}
        onSignOut={async () => {
          await clearTravellerSession();
          setToken(null);
          setSent(false);
          setCode("");
        }}
        onExpired={async () => {
          // The token behind "signed in" is a status token, and it expires
          // like any other. Back to the form, with the reason — not a generic
          // failure over a list that can never load.
          await clearTravellerSession();
          setToken(null);
          setSent(false);
          setCode("");
          setExpired(true);
        }}
      />
    );
  }

  const failure = verify.error
    ? describeError(verify.error)
    : request.error
      ? describeError(request.error)
      : null;

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        There is no account to make
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        Booking never needs one. If you want every trip on your number in one
        place — including ones booked on another phone — we send a code to that
        number. That is the whole of it: no password, no sign-up.
      </p>

      {expired ? (
        <Panel role="status" className="mt-4 px-4 py-3 text-xs">
          Your sign-in has expired — they do, after a while. Send a new code and
          every trip on your number is back.
        </Panel>
      ) : null}

      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (sent) verify.mutate();
          else request.mutate();
        }}
      >
        <Field
          label="WhatsApp number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={sent}
          autoComplete="tel"
          placeholder="+91…"
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
            className="font-mono"
            hint={
              devCode
                ? `Development build — the code is ${devCode}.`
                : undefined
            }
            required
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
              ? "Show me my trips"
              : "Send me a code"}
        </Button>
      </form>

      {sent && !failure ? (
        <p className="text-forest/70 mt-4 text-xs" role="status">
          If that number has booked with us, a code is on its way. We answer the
          same way for every number, so this is not a way to check whether
          somebody has booked.
        </p>
      ) : null}

      {failure ? <FailurePanel failure={failure} className="mt-6" /> : null}

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
        Booked on this device?{" "}
        <Link href="/trips" className="text-terra-deep tap-target underline">
          Those are already under Trips
        </Link>
        , no code needed.
      </p>
    </Screen>
  );
}

/** T11 — every trip this phone number has booked, wherever it was booked. */
function SignedIn({
  token,
  onSignOut,
  onExpired,
}: {
  token: string;
  onSignOut: () => void | Promise<void>;
  onExpired: () => void | Promise<void>;
}) {
  const bookings = useQuery({
    queryKey: ["listMyBookings", token],
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/me/bookings", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  // A booking made on another device is claimed onto this one by keeping its
  // token: the list gives us the trips, the token gives us the access. Under
  // the booking's reference — the same key a checkout-made record is re-keyed
  // to — so a trip already on this device is updated, not listed twice.
  useEffect(() => {
    for (const b of bookings.data?.bookings ?? []) {
      if (b.statusToken) {
        void rememberBooking({ reference: b.reference, token: b.statusToken });
      }
    }
  }, [bookings.data]);

  // The list's own token died. Hand the screen back to the form.
  useEffect(() => {
    if (bookings.isError && isDeadToken(bookings.error)) void onExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.isError, bookings.error]);

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Every trip on your number
      </h1>

      {bookings.isPending ? (
        <Skeleton className="mt-6 h-24 w-full" />
      ) : bookings.isError ? (
        <FailurePanel
          failure={describeError(bookings.error, { tokenBearing: true })}
          className="mt-6"
        >
          <p className="text-forest/70 mt-3 text-sm">
            The ones on this device are still under{" "}
            <Link href="/trips" className="text-terra-deep underline">
              Trips
            </Link>
            .
          </p>
        </FailurePanel>
      ) : bookings.data.bookings.length === 0 ? (
        <p className="text-forest/70 mt-6 text-sm">
          Nothing booked on this number yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.data.bookings.map((b) => (
            <li key={b.reference}>
              <Panel>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold">{b.experience}</p>
                  {/*
                    The SHARED chip — yuvoy-app#26. This rendered the wire
                    value, so a traveller waiting on an operator read
                    `awaiting_operator` and somebody who missed the boat read
                    `no_show`. Trips had the full map two directories away and
                    this screen bypassed it; there is now one map.
                  */}
                  <StateChip state={b.state} />
                </div>
                <p className="text-forest/70 mt-1 font-mono text-xs tracking-wider">
                  {b.reference}
                </p>
                <p className="text-forest/70 mt-2 text-sm">
                  {b.localTime} on {b.localDate} · {b.guests} guest
                  {b.guests === 1 ? "" : "s"}
                </p>
                {/* Trimmed for the reason `experience-detail` gives — an
                    empty meeting point reaches this list as "" or as spaces,
                    never as an absent key (yuvoy-app#25). */}
                {b.meetingPoint?.trim() ? (
                  <p className="text-forest/70 mt-1 text-xs">
                    {b.meetingPoint.trim()}
                  </p>
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => void onSignOut()}
        className="mt-10"
      >
        Forget this number on this device
      </Button>

      <p className="text-forest/70 mt-4 text-xs">
        This leaves the bookings saved on this device alone — they stay under
        Trips.
      </p>
    </Screen>
  );
}
