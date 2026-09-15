import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup, within } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { ExperienceCard } from "./experience-card";
import { EXPERIENCES } from "../../../mocks/fixtures";

/**
 * Right to left opens the experience — and, far more importantly, everything
 * else does not.
 *
 * A gesture layered onto a scroller is a gesture that can steal from it, so
 * the cases that matter here are the refusals: a scroll that curves, a drag
 * the wrong way, a mouse, the strip along the edge that belongs to iOS. Each
 * of them, wrong, is a traveller thrown onto a booking screen they did not
 * ask for while trying to look at the next reel.
 *
 * The curve and the commit rule are proved in `use-swipe-to-open.test.ts`;
 * this file is the wiring.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
}));

const experience = EXPERIENCES[0];
const href = `/e/${experience.slug}`;

/*
  Wrapped in a QueryClient because the card reads the saved set through one.

  Saving is a device-local list today and a server resource the day
  yuvoy-api#192 lands, and React Query is where that belongs either way: see
  `use-saved`. The gesture under test does not care, but the component cannot
  render without a client, and a provider here is cheaper than pushing feed-wide
  state through props to keep a test simple.
*/
function renderCard() {
  renderWithQuery(
    <ExperienceCard
      experience={experience}
      index={0}
      total={3}
      active
      mounted={false}
      muted
      autoplayAllowed={false}
    />,
  );
  return screen.getByRole("article");
}

/** The element the gesture translates: the card's only child. */
const surfaceOf = (article: HTMLElement) =>
  article.firstElementChild as HTMLElement;

interface Point {
  x: number;
  y: number;
}

/** One gesture, start to finish, in the pointer events a browser would send. */
function drag(
  el: HTMLElement,
  from: Point,
  to: Point,
  {
    pointerType = "touch",
    steps = 4,
    release = true,
  }: { pointerType?: string; steps?: number; release?: boolean } = {},
) {
  const init = { pointerId: 1, pointerType, isPrimary: true };
  fireEvent.pointerDown(el, { ...init, clientX: from.x, clientY: from.y });
  for (let i = 1; i <= steps; i++) {
    fireEvent.pointerMove(el, {
      ...init,
      clientX: from.x + ((to.x - from.x) * i) / steps,
      clientY: from.y + ((to.y - from.y) * i) / steps,
    });
  }
  if (release) {
    fireEvent.pointerUp(el, { ...init, clientX: to.x, clientY: to.y });
  }
}

beforeEach(() => push.mockClear());
afterEach(cleanup);

describe("swiping a reel", () => {
  it("opens the experience on a firm right-to-left drag", () => {
    const article = renderCard();
    drag(article, { x: 300, y: 400 }, { x: 180, y: 402 });
    expect(push).toHaveBeenCalledWith(href);
  });

  it("sends the traveller exactly where the arrow would have", () => {
    /*
      The arrow and the gesture are two routes to one screen — three with the
      title. If they ever disagree the card is lying about one of them, so the
      destination is read off the rendered link rather than restated here.

      It used to be read off the "See dates" button. yuvoy-app#36 removed that
      button and put an arrow in the rail above sound and share; the property
      is unchanged and only the control it is read from moved.
    */
    const article = renderCard();
    /* The arrow became a word on 15 September: "Book", or "View" when nothing is
       bookable in the next ninety days. Queried by ROLE and name rather than by
       an `aria-label`, because the control's visible text IS its name now and a
       label would be a second copy of it. */
    const link = screen.getByRole("link", { name: /^(Book|View)$/ });
    drag(article, { x: 300, y: 400 }, { x: 180, y: 400 });
    expect(push).toHaveBeenCalledWith(link.getAttribute("href"));
  });

  it("agrees with the title, which is the third way in", () => {
    renderCard();
    const arrow = screen.getByRole("link", { name: /^(Book|View)$/ });
    const title = within(screen.getByRole("heading", { level: 2 })).getByRole(
      "link",
    );
    expect(title.getAttribute("href")).toBe(arrow.getAttribute("href"));
  });

  it("follows the finger while the drag is happening", () => {
    const article = renderCard();
    const surface = surfaceOf(article);
    drag(article, { x: 300, y: 400 }, { x: 250, y: 400 }, { release: false });
    // 50px of finger, below the commit point, so the card is exactly attached.
    expect(surface.style.transform).toContain("-50.00px");
  });

  it("springs back, and opens nothing, when the drag stops short", () => {
    /*
      30px, and the number matters. `fireEvent` dispatches synchronously, so
      the timestamps between two moves can be a fraction of a millisecond
      apart and the measured velocity enormous — which is a FLICK, and a flick
      opens from 40px. At 40 this case passed alone and failed inside the full
      run, on nothing but how busy the machine was.

      That is the test being wrong rather than the rule: a real 40px flick
      takes ~80ms of real thumb and should open. The flick boundary is proved
      against the numbers in `use-swipe-to-open.test.ts`, where time is not
      being synthesised; here the drag is simply short enough that no rule can
      read it as anything.
    */
    const article = renderCard();
    const surface = surfaceOf(article);
    drag(article, { x: 300, y: 400 }, { x: 270, y: 400 });
    expect(push).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("");
  });

  it("leaves a vertical scroll alone", () => {
    // The feed's whole reason for existing. A thumb that arcs while scrolling
    // must never hand the gesture over.
    const article = renderCard();
    const surface = surfaceOf(article);
    drag(article, { x: 300, y: 600 }, { x: 240, y: 200 });
    expect(push).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("");
  });

  it("will not be talked into it by a scroll that curves a long way", () => {
    // 90px of horizontal drift over 130px of scroll — more than the commit
    // distance, and still a scroll. The axis is decided once, at the slop, and
    // never revisited.
    const article = renderCard();
    drag(article, { x: 300, y: 600 }, { x: 210, y: 470 });
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores a drag the other way", () => {
    // There is nothing to the left of a reel to reveal.
    const article = renderCard();
    drag(article, { x: 150, y: 400 }, { x: 300, y: 400 });
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores a mouse, which is how people select and drag", () => {
    const article = renderCard();
    drag(
      article,
      { x: 300, y: 400 },
      { x: 150, y: 400 },
      {
        pointerType: "mouse",
      },
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores a second finger, so a pinch is not a swipe", () => {
    const article = renderCard();
    const init = { pointerId: 2, pointerType: "touch", isPrimary: false };
    fireEvent.pointerDown(article, { ...init, clientX: 300, clientY: 400 });
    fireEvent.pointerMove(article, { ...init, clientX: 150, clientY: 400 });
    fireEvent.pointerUp(article, { ...init, clientX: 150, clientY: 400 });
    expect(push).not.toHaveBeenCalled();
  });

  it("puts the card back when the browser takes the gesture away", () => {
    // A pointercancel is a scroll starting, a call arriving, the app going to
    // the background. None of them is a navigation, and none of them may leave
    // the card sitting off to one side.
    const article = renderCard();
    const surface = surfaceOf(article);
    const init = { pointerId: 1, pointerType: "touch", isPrimary: true };
    fireEvent.pointerDown(article, { ...init, clientX: 300, clientY: 400 });
    fireEvent.pointerMove(article, { ...init, clientX: 220, clientY: 400 });
    expect(surface.style.transform).not.toBe("");
    fireEvent.pointerCancel(article, { ...init, clientX: 220, clientY: 400 });
    expect(push).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("");
  });
});

describe("the strip along the right edge", () => {
  /*
    On iOS a drag beginning at the frame's edge is the system's own
    back/forward gesture. Competing with it gives a traveller two navigations
    for one swipe — so the guard exists, and it is measured against the card's
    own box rather than the window's, because on a desktop the well is a
    480px column with stage either side of it.
  */
  const CARD = { left: 0, right: 400, width: 400, height: 800 };

  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      ...CARD,
      top: 0,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => CARD,
    } as DOMRect);
  });

  afterEach(() => vi.restoreAllMocks());

  it("leaves a drag that starts on the edge to the platform", () => {
    const article = renderCard();
    drag(article, { x: 390, y: 400 }, { x: 250, y: 400 });
    expect(push).not.toHaveBeenCalled();
  });

  it("still opens for a drag that starts just inside it", () => {
    const article = renderCard();
    drag(article, { x: 370, y: 400 }, { x: 230, y: 400 });
    expect(push).toHaveBeenCalledWith(href);
  });
});

describe("the click that follows a swipe", () => {
  it("is swallowed, so a thumb resting on a control does not fire it", () => {
    /*
      A drag still produces a `click` on whatever it ended over — the mute
      disc, the share disc, the button itself. Acting on that would fire a
      control the traveller was only resting a thumb on, on top of the
      navigation the swipe already started.
    */
    const article = renderCard();
    drag(article, { x: 300, y: 400 }, { x: 180, y: 400 });
    // fireEvent returns false when something called preventDefault.
    expect(fireEvent.click(article)).toBe(false);
  });

  it("is swallowed after a swipe that decided NOT to open, too", () => {
    // The traveller dragged and changed their mind. That is not a tap either.
    const article = renderCard();
    drag(article, { x: 300, y: 400 }, { x: 270, y: 400 });
    expect(push).not.toHaveBeenCalled();
    expect(fireEvent.click(article)).toBe(false);
  });

  it("lets an ordinary tap through", () => {
    const article = renderCard();
    const init = { pointerId: 1, pointerType: "touch", isPrimary: true };
    fireEvent.pointerDown(article, { ...init, clientX: 300, clientY: 400 });
    fireEvent.pointerUp(article, { ...init, clientX: 301, clientY: 400 });
    expect(fireEvent.click(article)).toBe(true);
  });

  it("lets a tap through after a scroll, which is not a swipe", () => {
    const article = renderCard();
    drag(article, { x: 300, y: 600 }, { x: 290, y: 300 });
    expect(fireEvent.click(article)).toBe(true);
  });

  it("swallows one click and not the next", () => {
    // The flag must not outlive the gesture that set it, or the first real tap
    // after any swipe is silently eaten.
    const article = renderCard();
    drag(article, { x: 300, y: 400 }, { x: 270, y: 400 });
    expect(fireEvent.click(article)).toBe(false);
    expect(fireEvent.click(article)).toBe(true);
  });
});

describe("the reel no longer names the operator — yuvoy-app#36", () => {
  it("carries no link to the business's page", () => {
    /*
      The name and its Verified tag were the first two of nine things over the
      clip, and the owner's complaint on 13 September was the pile rather than
      any one of them. The business is still one tap away: the listing's
      "Operator" row opens `/o/{slug}`, which is the route that page was built
      for (yuvoy-app#30) and is unchanged.
    */
    renderCard();
    expect(
      screen.queryByRole("link", { name: experience.operator.name }),
    ).toBeNull();
    expect(screen.queryByText(experience.operator.name)).toBeNull();
  });

  it("still swallows the click a swipe leaves on a control in the caption", () => {
    /*
      The property the operator link used to prove, moved to the control that
      replaced it. The title sits in the caption, exactly where a thumb lands
      to swipe; the gesture is decided on the article, so a drag beginning on
      the title is still a swipe — and the click it leaves behind must not
      then follow the link a second time.
    */
    renderCard();
    const title = within(screen.getByRole("heading", { level: 2 })).getByRole(
      "link",
    );
    drag(title, { x: 300, y: 400 }, { x: 180, y: 400 });
    expect(push).toHaveBeenCalledWith(href);
    expect(fireEvent.click(title)).toBe(false);
  });
});
