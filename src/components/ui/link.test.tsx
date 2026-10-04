import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import Link from "./link";

/**
 * Every in-app link carries the type of its screen change (the motion system,
 * approved 4 Oct 2026). Next drops the prop from the anchor, so the stand-in
 * below writes down what it was handed.
 */

const nav = vi.hoisted(() => ({ pathname: "/trips" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    transitionTypes,
    children,
    ...rest
  }: {
    href: string;
    transitionTypes?: string[];
    children?: ReactNode;
  }) => (
    <a href={href} data-types={transitionTypes?.join(" ") ?? ""} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  nav.pathname = "/trips";
});

const types = (name: string) =>
  screen.getByRole("link", { name }).getAttribute("data-types");

describe("Link", () => {
  it("works the motion out from the two routes", () => {
    render(<Link href="/booking#t=abc">Your booking</Link>);
    expect(types("Your booking")).toBe("deeper");
  });

  it("is a step back when it says so", () => {
    nav.pathname = "/booking";
    render(
      <Link href="/trips" back>
        Back to your trips
      </Link>,
    );
    expect(types("Back to your trips")).toBe("back");
  });

  it("moves sideways between tab roots", () => {
    render(<Link href="/account">Account</Link>);
    expect(types("Account")).toBe("sideways");
  });

  it("does not move for the same screen or when told not to", () => {
    render(
      <>
        <Link href="/trips?past=1">Past</Link>
        <Link href="/account" motion="none">
          Quietly
        </Link>
      </>,
    );
    expect(types("Past")).toBe("");
    expect(types("Quietly")).toBe("");
  });

  it("lets an explicit list stand, as Next's own prop", () => {
    render(
      <Link href="/account" transitionTypes={["custom"]}>
        Custom
      </Link>,
    );
    expect(types("Custom")).toBe("custom");
  });

  it("passes everything else to Next's link untouched", () => {
    render(
      <Link href="/account" className="x" aria-current="page">
        Account
      </Link>,
    );
    const link = screen.getByRole("link", { name: "Account" });
    expect(link).toHaveAttribute("href", "/account");
    expect(link).toHaveClass("x");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).not.toHaveAttribute("back");
    expect(link).not.toHaveAttribute("motion");
  });
});
