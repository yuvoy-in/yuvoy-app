import { redirect } from "next/navigation";
import { createApiClient } from "@/lib/api/client";

/**
 * T1 — arrival from a printed QR code.
 *
 * Server-side on purpose. The scan is recorded from here so that nothing
 * correlatable ever touches the client: the endpoint sets no cookie, stores no
 * device id and keeps no IP, and it is the reason there is no consent banner
 * between a traveller and a QR code on a jetty. Adding an identifier from our
 * side would defeat that design — and there is no field for one.
 *
 * The response is always a destination, including for a code that resolves to
 * nothing. Somebody standing on a pier holding a scuffed card did nothing
 * wrong, and a 404 there is a dead end with no staff nearby.
 */
export const dynamic = "force-dynamic";

const CODE_PATTERN = /^[A-Za-z0-9-]{3,32}$/;

export default async function ScanArrivalPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  // A malformed code is still somebody standing on a jetty. Send them to the
  // feed rather than showing them a validation error.
  if (!CODE_PATTERN.test(code)) redirect("/");

  let target = "/";

  try {
    const api = createApiClient();
    const { data } = await api.POST("/scans", { body: { code } });
    if (data?.target) target = data.target;
  } catch {
    // Counting a scan is a marketing concern. It must never be the reason a
    // traveller cannot get to the feed.
  }

  // The code travels on in the URL rather than in storage, so checkout can put
  // it in `attribution.scanCode` — the code itself, never a scan id, because
  // an id the client keeps and sends back is exactly the correlatable token
  // POST /scans refuses to mint.
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}src=qr&code=${encodeURIComponent(code)}`);
}
