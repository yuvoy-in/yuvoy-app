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
import { saveToken } from "@/lib/booking/token-store";
import { Field } from "@/components/ui/field";
import { describeError, Skeleton, LoadingState } from "@/components/states";

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
      <Shell>
        <LoadingState label="Loading your trips">
          <Skeleton className="h-32 w-full" />
        </LoadingState>
      </Shell>
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
      />
    );
  }

  const failure = verify.error
    ? describeError(verify.error)
    : request.error
      ? describeError(request.error)
      : null;

  return (
    <Shell>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        There is no account to make
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        Booking never needs one. If you want every trip on your number in one
        place — including ones booked on another phone — we send a code to that
        number. That is the whole of it: no password, no sign-up.
      </p>

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

        <button
          type="submit"
          disabled={request.isPending || verify.isPending}
          className="rounded-edge label bg-forest text-cream h-13 w-full font-bold disabled:opacity-40"
        >
          {request.isPending || verify.isPending
            ? "Working…"
            : sent
              ? "Show me my trips"
              : "Send me a code"}
        </button>
      </form>

      {sent && !failure ? (
        <p className="text-forest/70 mt-4 text-xs" role="status">
          If that number has booked with us, a code is on its way. We answer the
          same way for every number, so this is not a way to check whether
          somebody has booked.
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          className="rounded-edge border-terra-deep mt-6 border-l-2 p-4"
        >
          <p className="text-sm font-bold">{failure.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
        </div>
      ) : null}

      <p className="text-forest/70 mt-8 text-xs">
        Booked on this device?{" "}
        <Link href="/trips" className="text-terra-deep tap-target underline">
          Those are already under Trips
        </Link>
        , no code needed.
      </p>
    </Shell>
  );
}

/** T11 — every trip this phone number has booked, wherever it was booked. */
function SignedIn({
  token,
  onSignOut,
}: {
  token: string;
  onSignOut: () => void | Promise<void>;
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
  // token: the list gives us the trips, the token gives us the access.
  useEffect(() => {
    for (const b of bookings.data?.bookings ?? []) {
      if (b.statusToken) void saveToken(b.reference, b.statusToken);
    }
  }, [bookings.data]);

  const failure = bookings.error ? describeError(bookings.error) : null;

  return (
    <Shell>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Every trip on your number
      </h1>

      {bookings.isPending ? (
        <Skeleton className="mt-6 h-24 w-full" />
      ) : bookings.isError ? (
        <div
          role="alert"
          className="rounded-edge border-terra-deep mt-6 border-l-2 p-4"
        >
          <p className="text-sm font-bold">{failure?.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure?.body}</p>
          <p className="text-forest/70 mt-3 text-sm">
            The ones on this device are still under{" "}
            <Link href="/trips" className="text-terra-deep underline">
              Trips
            </Link>
            .
          </p>
        </div>
      ) : bookings.data.bookings.length === 0 ? (
        <p className="text-forest/70 mt-6 text-sm">
          Nothing booked on this number yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.data.bookings.map((b) => (
            <li
              key={b.reference}
              className="rounded-edge border-cream-line bg-cream-deep border p-4"
            >
              <p className="font-bold">{b.experience}</p>
              <p className="text-forest/70 mt-1 font-mono text-xs tracking-wider">
                {b.reference}
              </p>
              <p className="text-forest/70 mt-2 text-sm">
                {b.localTime} on {b.localDate} · {b.guests} guest
                {b.guests === 1 ? "" : "s"}
              </p>
              {b.meetingPoint ? (
                <p className="text-forest/70 mt-1 text-xs">{b.meetingPoint}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="label text-forest/70 tap-target hover:text-forest mt-10 underline underline-offset-2"
      >
        Forget this number on this device
      </button>

      <p className="text-forest/70 mt-6 text-xs">
        This leaves the bookings saved on this device alone — they stay under
        Trips.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-xl py-8">{children}</div>
    </div>
  );
}
