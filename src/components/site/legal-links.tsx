/**
 * Where the privacy policy and the terms live — yuvoy-app#15.
 *
 * ## Why they are on the marketing site rather than here
 *
 * Owner's decision, 9 Sep 2026, taking the cheaper of the two options the
 * issue set out. `yuvoy.in/privacy` and `/terms` exist, are real scoped copy
 * rather than placeholder, and are the same documents the operator portal and
 * the marketing site itself already stand on. Giving this app its own pages
 * would have meant writing copy nobody has written, which would have blocked
 * on the owner rather than shipping.
 *
 * ## They are `noindex`, and that is fine here
 *
 * Both pages carry `noindex` and sit on the robots disallow list pending legal
 * review (yuvoy-web#152). **That governs search results, not reachability** —
 * a person who taps one of these links reads the page exactly as they would
 * have. The two are unrelated, and conflating them would be an argument for
 * hiding a policy from the people it is about.
 *
 * ## Why it is not just tidiness
 *
 * This app **already collects a health-screener answer at checkout** and a
 * phone number with it. A privacy policy that is not linked from anywhere near
 * where the data is given is not a policy anybody relied on. It is also the
 * first thing a payment provider's KYC review asks about, and payments are the
 * next thing to land.
 *
 * Absolute URLs on purpose: these are another origin, and a root-relative path
 * would resolve to this app and 404.
 */

export const PRIVACY_URL = "https://yuvoy.in/privacy";
export const TERMS_URL = "https://yuvoy.in/terms";

export function LegalLinks({
  tone = "light",
  className,
}: {
  /** `dark` for the consent banner, which sits on the forest chrome. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const link =
    tone === "dark"
      ? "text-paper/70 hover:text-paper underline underline-offset-2"
      : "text-forest/70 hover:text-forest underline underline-offset-2";

  return (
    <p className={className}>
      {/*
        `rel="noopener"` and not `target="_blank"`. Opening a policy in a new
        tab on a phone leaves somebody with two tabs and no obvious way back to
        their booking; the browser's own back button is the way back, and it
        works.
      */}
      <a href={PRIVACY_URL} rel="noopener" className={link}>
        Privacy
      </a>
      <span aria-hidden="true" className="mx-2 opacity-50">
        ·
      </span>
      <a href={TERMS_URL} rel="noopener" className={link}>
        Terms
      </a>
    </p>
  );
}
