import { formatMoney } from "@/lib/format/money";
import { Panel } from "@/components/ui/panel";
import type { components } from "@/lib/api/schema.gen";
import { FadeText } from "@/components/ui/fade-text";

type Money = components["schemas"]["Money"];

/**
 * The price and the cancellation policy, frozen at this moment, with the box
 * that accepts the policy and the separate one for marketing.
 */
export function CheckoutTerms({
  total,
  each,
  cancellationPolicy,
  policyAccepted,
  onPolicyAcceptedChange,
  marketing,
  onMarketingChange,
}: {
  total: Money | null;
  each: string | null;
  cancellationPolicy: string | undefined;
  policyAccepted: boolean;
  onPolicyAcceptedChange: (accepted: boolean) => void;
  marketing: boolean;
  onMarketingChange: (marketing: boolean) => void;
}) {
  return (
    <Panel>
      <div className="flex items-baseline justify-between">
        <span className="label text-forest/75">Total</span>
        {total ? (
          <span className="text-xl font-bold">
            <FadeText>{formatMoney(total)}</FadeText>
          </span>
        ) : (
          <span className="text-forest/70 text-sm">
            Confirmed before you pay
          </span>
        )}
      </div>
      {each ? (
        <p
          className="text-forest/70 mt-1 text-right text-sm"
          data-testid="checkout-each"
        >
          {each}
        </p>
      ) : null}
      <p className="text-forest/70 mt-1.5 text-xs">
        All in. Nothing is added after this screen.
      </p>

      {/*
        UNCONDITIONAL, and that is the fix for yuvoy-app#28.

        `policyAccepted` is required unconditionally in `blockers`, so the
        control that clears it must render unconditionally too. It was
        gated on `experience.cancellationPolicy` while the blocker was
        not, and every listing that came back without the field, which
        was all of them, got a permanently dead submit button asking for
        a checkbox that was not on the page.

        The absent case is now refused above, in `CheckoutForm`, before
        this form exists at all. So by the time this renders the policy is
        present, and this must NOT go back to a conditional: the pair
        being conditional-and-unconditional is the defect itself.
      */}
      {/*
        THE TERMS, as a list above the box rather than a paragraph inside
        its label.

        The fixture's policy is one 71-character sentence and read fine
        inline. PRODUCTION's is 227 characters and four rules: two refund
        windows, a no-refund cutoff and a weather clause. Inline, that put
        a wall of text inside the one control a traveller has to tick,
        which is the "read paragraphs to understand a simple booking" the
        brief names. The fixture hid it; the live API did not.

        Nothing is HIDDEN to fix it. This is consent to terms, so every
        rule stays on screen and in the order the operator wrote it: a tap
        to reveal them would make the consent less informed, not more.
        What changes is only that the rules are a list somebody can scan,
        and the checkbox's own words are short. `aria-describedby` still
        ties the box to the terms, so a screen reader hears them with it.
      */}
      <div id="policy-text" className="mt-4">
        <p className="label text-forest/75">If plans change</p>
        <ul className="voice-host text-forest/80 leading-body mt-2 space-y-1 text-sm text-pretty">
          {policyLines(cancellationPolicy).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      <label className="mt-3 flex cursor-pointer gap-3 text-sm">
        <input
          type="checkbox"
          checked={policyAccepted}
          onChange={(e) => onPolicyAcceptedChange(e.target.checked)}
          // 24px: a tick is a target (WCAG 2.5.8; `pnpm qa` holds it).
          className="accent-terra-deep size-6 shrink-0"
          aria-describedby="policy-text"
        />
        <span className="text-forest/80 pt-0.5">
          I have read what happens if it is called off
        </span>
      </label>

      {/* Separate, and unticked. Consent to be marketed to is not consent
          to be transported. */}
      <label className="mt-3 flex cursor-pointer gap-3 text-sm">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => onMarketingChange(e.target.checked)}
          className="accent-terra-deep size-6 shrink-0"
        />
        <span className="text-forest/70 pt-0.5">
          Send me the occasional thing worth doing. Optional.
        </span>
      </label>
    </Panel>
  );
}

/**
 * A cancellation policy, one rule per line.
 *
 * Split on sentence ends because that is how operators write these: each
 * refund window is its own sentence. A policy that is one sentence stays one
 * line, and a split in the wrong place (an abbreviation, say) only adds a line
 * break, never loses a word, which is the safe way for consent text to fail.
 */
export function policyLines(policy: string | undefined): string[] {
  return (policy ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
