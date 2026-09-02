import type { components } from "@/lib/api/schema.gen";

export type PaymentOrder = components["schemas"]["PaymentOrder"];

/**
 * Opens the provider's checkout for an order. The one seam that changes when
 * a processor lands.
 *
 * `POST /reservations/{id}/payment-order` answers 201 with an order naming
 * its `provider`, and from there the provider's own page or widget takes the
 * money — never this app. Which provider is a business decision still
 * outstanding (yuvoy-api#67), so today there is nothing registered here, and
 * `openHostedCheckout` says so rather than pretending: a traveller holding a
 * ready order and a live countdown is told that this version of the app
 * cannot open the page yet and that nothing has been charged. Untrue would be
 * a spinner.
 *
 * When a processor exists, its adapter is registered by provider name from a
 * single install site and the button above needs no change.
 */
export type PaymentAdapter = (order: PaymentOrder) => Promise<void>;

const adapters = new Map<string, PaymentAdapter>();

export function registerPaymentAdapter(
  provider: string,
  adapter: PaymentAdapter,
): () => void {
  adapters.set(provider, adapter);
  return () => {
    adapters.delete(provider);
  };
}

export function hasPaymentAdapter(provider: string): boolean {
  return adapters.has(provider);
}

export type HandoffOutcome = "opened" | "no_adapter";

export async function openHostedCheckout(
  order: PaymentOrder,
): Promise<HandoffOutcome> {
  const adapter = adapters.get(order.provider);
  if (!adapter) return "no_adapter";
  await adapter(order);
  return "opened";
}
