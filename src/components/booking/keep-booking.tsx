"use client";

import { useEffect, useMemo, useState } from "react";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { createApiClient } from "@/lib/api/client";
import { civilInZone, weekdayDayMonth } from "@/lib/format/date";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { CheckIcon, CopyIcon, ShareIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/** Skip is per booking and per tab. The key the issue names. */
const dismissKey = (status: BookingStatus) =>
  `yuvoy.keep-dismissed.${status.bookingReference ?? status.reservationId}`;

/** Nothing worth keeping about a trip that is not happening. */
const NOT_HAPPENING = ["cancelled", "declined", "expired"];

/**
 * Keep your booking (yuvoy-app#61).
 *
 * ## Why this exists at all
 *
 * yuvoy-app#60 removed the device's own copy of a booking, on the owner's
 * reasoning that it served no purpose offline because the app does not load
 * without a network. That is true and it left a real gap: a traveller on a
 * jetty with no signal had nothing. This is the answer, and it is a better one,
 * because an image in Photos survives a cleared browser, a new phone and a flat
 * battery on somebody else's device.
 *
 * ## Save to Photos is a share sheet, and only where that works
 *
 * There is no "write to the camera roll" API on the web. What there is, on
 * iOS, is `navigator.share({ files })`, whose sheet carries "Save Image". So
 * the button is drawn ONLY where `canShare({ files })` is true, and Download
 * covers every other device. A "Save to Photos" that quietly downloads instead
 * would be a lie about where the file went.
 *
 * ## Share never sends the booking page
 *
 * `POST /bookings/share` mints a SEPARATE token for a read-only `/trip/` page.
 * The status token this component holds opens the booking and can cancel it;
 * sharing it into a hostel WhatsApp group would hand six strangers a cancel
 * button.
 */
export function KeepBooking({
  status,
  token,
}: {
  status: BookingStatus;
  token: string;
}) {
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState<"photos" | "download" | "share" | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  /*
    Both of these are reads of the BROWSER, not state, and they are taken after
    mount rather than during the first render.

    `sessionStorage` and `navigator.canShare` do not exist on the server, so
    deciding during the first render would mean the server drawing one thing
    and the browser another: the hydration mismatch class of yuvoy-app#67.
    An effect that set state would do it too, and `react-hooks/
    set-state-in-effect` correctly refuses that: this is derived from the
    environment, not something that changes over time.
  */
  const mounted = useHasMounted();

  const storedDismissal = useMemo(() => {
    if (!mounted) return false;
    try {
      return sessionStorage.getItem(dismissKey(status)) === "1";
    } catch {
      /*
        A private window can refuse session storage. Then the panel shows,
        which is the harmless direction to fail in.
      */
      return false;
    }
  }, [mounted, status]);

  const canShareFiles = useMemo(() => {
    if (!mounted) return false;
    /*
      `canShare` must be asked WITH a file, not merely checked for existence.
      Several desktop browsers have `navigator.share` and refuse files, and
      asking the general question there answers yes.
    */
    try {
      const probe = new File(["x"], "probe.png", { type: "image/png" });
      return Boolean(navigator.canShare?.({ files: [probe] }));
    } catch {
      return false;
    }
  }, [mounted]);

  const dismissed = skipped || storedDismissal;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (NOT_HAPPENING.includes(status.state)) return null;

  /*
    ONE component, and the variant is now a consequence rather than a choice.

    It used to be a prop, and the trip screen passed BOTH: a `panel` and a
    `row`, at two points in the same stack. The panel hid itself once dismissed
    and the row never did, so before anybody pressed Skip the page offered the
    same three actions twice, about forty lines apart. The revamp brief named
    the survivor by its own heading: "remove unnecessary elements such as
    repetitive 'Save or share this booking'".

    The requirement it was reaching for is real and is kept (yuvoy-app#61):
    "keep a Save or share this booking row after Skip too". Skipping the prompt
    is not the same as never wanting the booking again. So the prompt becomes
    the row rather than being joined by one.
  */
  const variant: "panel" | "row" = dismissed ? "row" : "panel";

  const reference = status.bookingReference ?? status.reservationId ?? "trip";
  const filename = `yuvoy-${reference}.png`;

  async function pass(): Promise<File> {
    /*
      The token in the BODY, never the URL. It opens the booking and can cancel
      it, and a URL is in the address bar, in history, in a referrer and in any
      screenshot of the browser.
    */
    const response = await fetch("/api/booking-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error(`pass ${response.status}`);
    const blob = await response.blob();
    return new File([blob], filename, { type: "image/png" });
  }

  const toPhotos = async () => {
    setBusy("photos");
    setFailed(false);
    try {
      const file = await pass();
      await navigator.share({ files: [file] });
    } catch (error) {
      /*
        Dismissing the sheet is a decision, not a failure. `AbortError` is what
        a cancelled share throws, and an error panel for it would scold
        somebody for changing their mind.
      */
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setFailed(true);
      }
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("download");
    setFailed(false);
    try {
      const file = await pass();
      const href = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked next tick: doing it in the same frame races the save in WebKit.
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    setFailed(false);
    try {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/share", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error || !data?.shareUrl) throw error ?? new Error("no link");

      const civil = status.slot?.startsAt
        ? civilInZone(
            status.slot.startsAt,
            status.slot.timezone ?? "Asia/Kolkata",
          )
        : null;
      const text = [
        status.experience?.title,
        civil ? `on ${weekdayDayMonth(civil)}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      if (navigator.share) {
        await navigator.share({
          title: "Our trip",
          text: text || undefined,
          url: data.shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setFailed(true);
      }
    } finally {
      setBusy(null);
    }
  };

  const heading =
    variant === "panel" ? "Keep your booking" : "Save or share this booking";

  const body = (
    <>
      <p className="text-sm font-bold">{heading}</p>
      {variant === "panel" ? (
        <p className="text-forest/70 mt-1.5 text-sm">
          The app needs a connection, so keep a copy for the jetty.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canShareFiles ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void toPhotos()}
          >
            {busy === "photos" ? "Making it…" : "Save to Photos"}
          </Button>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void download()}
        >
          {busy === "download" ? "Making it…" : "Download"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void share()}
        >
          {/*
            The glyph follows what the button will actually do, and the
            decision is made from `canShareFiles`, which is read after mount.
            Touching `navigator` during render would throw on the server.
          */}
          {copied ? (
            <CheckIcon className="size-4" />
          ) : canShareFiles ? (
            <ShareIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
          {copied ? "Copied" : busy === "share" ? "Making a link…" : "Share"}
        </Button>
      </div>

      {failed ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          We could not make the image. Try again.
        </p>
      ) : null}

      {variant === "panel" ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => {
            try {
              sessionStorage.setItem(dismissKey(status), "1");
            } catch {
              // Refused. The panel still closes for this render, which is what
              // the traveller asked for; it comes back on reload.
            }
            setSkipped(true);
          }}
        >
          Skip
        </Button>
      ) : null}
    </>
  );

  return variant === "panel" ? (
    <Panel className="mt-6">{body}</Panel>
  ) : (
    <div className="border-paper-line mt-8 border-t pt-6">{body}</div>
  );
}
