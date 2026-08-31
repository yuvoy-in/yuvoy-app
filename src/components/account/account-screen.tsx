"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import {
  getSession,
  saveSession,
  clearSession,
  type Session,
} from "@/lib/auth/session";
import { saveToken } from "@/lib/booking/token-store";
import { Field } from "@/components/ui/field";
import { describeError, Skeleton, LoadingState } from "@/components/states";

/**
 * T5 and T11 — signing in, and what an account is actually worth.
 *
 * The copy here is doing real work. An account is optional, nothing is gated
 * behind it, and saying so plainly is what stops the sign-in screen reading as
 * a wall. A login prompt in front of a stranger with a phone is the largest
 * drop-off available in this product, which is exactly why checkout never
 * shows one.
 *
 * What signing in buys, and all it buys: your trips follow you to a new phone.
 */
export function AccountScreen() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void getSession().then((s) => {
      if (!cancelled) setSession(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { data, error } = await client.POST("/auth/otp/request", {
        body: { phone: phone.trim() },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSent(true);
      setDevCode((data as { devCode?: string } | undefined)?.devCode);
    },
  });

  const verify = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { data, error } = await client.POST("/auth/otp/verify", {
        body: { phone: phone.trim(), code: code.trim() },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (tokens) => {
      await saveSession(tokens);
      setSession(await getSession());
    },
  });

  if (session === undefined) {
    return (
      <Shell>
        <LoadingState label="Loading your account">
          <Skeleton className="h-32 w-full" />
        </LoadingState>
      </Shell>
    );
  }

  if (session)
    return <SignedIn session={session} onSignOut={() => setSession(null)} />;

  const failure = verify.error
    ? describeError(verify.error)
    : request.error
      ? describeError(request.error)
      : null;

  return (
    <Shell>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        An account is optional
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        Booking never needs one, and nothing here is locked behind it. Signing
        in does one thing: your trips follow you if you change phone or lose
        this one.
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
              ? "Sign in"
              : "Send me a code"}
        </button>
      </form>

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
        Already booked without an account?{" "}
        <Link href="/trips" className="text-terra-deep tap-target underline">
          Your trips are on this device
        </Link>
        .
      </p>
    </Shell>
  );
}

/** T11 — every trip this phone number has booked, wherever it was booked. */
function SignedIn({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const bookings = useQuery({
    queryKey: ["listMyBookings", session.user.id],
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/me/bookings", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal,
      });
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  // A guest booking made on this device is claimed into the account by keeping
  // its token — the account gives us the list, the device gives us the access.
  useEffect(() => {
    for (const b of bookings.data?.bookings ?? []) {
      if (b.statusToken) void saveToken(b.reference, b.statusToken);
    }
  }, [bookings.data]);

  return (
    <Shell>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        {session.user.name ?? "Your account"}
      </h1>
      <p className="text-forest/70 mt-2 text-sm">{session.user.phone}</p>

      <h2 className="label text-forest/75 mt-8">Every trip on this number</h2>

      {bookings.isPending ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : bookings.isError ? (
        <p className="text-forest/70 mt-3 text-sm">
          We could not load your trips just now. The ones on this device are
          still under{" "}
          <Link href="/trips" className="text-terra-deep underline">
            Trips
          </Link>
          .
        </p>
      ) : bookings.data.bookings.length === 0 ? (
        <p className="text-forest/70 mt-3 text-sm">
          Nothing booked on this number yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
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
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={async () => {
          await clearSession();
          onSignOut();
        }}
        className="label text-forest/70 tap-target hover:text-forest mt-10 underline underline-offset-2"
      >
        Sign out
      </button>

      <p className="text-forest/70 mt-6 text-xs">
        Signing out leaves the bookings saved on this device alone — they stay
        under Trips.
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
