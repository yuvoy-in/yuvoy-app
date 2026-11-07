"use client";

import { useEffect, useRef, useState } from "react";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { guestActions } from "@/lib/plans/guest-actions";
import { guestWords } from "@/lib/plans/guest-words";
import type { PlanActionResult, PlanView } from "@/lib/plans/types";
import { planWords, refusalLine } from "@/lib/plans/words";
import { Field } from "@/components/ui/field";
import { GuestFooter, type LinkLine } from "./guest-footer";
import { PlanViewScreen } from "./plan-view";

/** The first-name box's refusal, drawn by the box: the reply form draws none. */
const NAME_FIELD = ["name"] as const;

/**
 * A plan read by its link, once it has loaded (yuvoy-mobile#373): the shared
 * plan view in guest mode, with the first-name box inside its form and the
 * guest's footer under it.
 *
 * ## One set of actions per page load
 *
 * `guestActions` is made once, when this mounts, because it holds the
 * first-reply nonce: every send of this form is the same guest (case 4).
 * What it needs to know at the moment of a send (the plan as last answered,
 * what is in the name box, whether there is a session) it reads from a value
 * made with it, which `put` brings up to date where each is set, so a send
 * never acts on the plan or the name of a render ago. A plain value, not a
 * ref: the actions read it at a send, never during a render.
 *
 * ## The plan, twice
 *
 * The view keeps the plan it draws, from each answer to its own form. This
 * keeps the same plan for what it draws around the view, and hands it down:
 * every answer that is the plan reaches both through `onPlan`, whichever
 * control sent it, so the footer's "linked", last week's paid marks and the
 * people above always agree.
 *
 * ## The first name
 *
 * Asked for on a first reply with no session: a reply that belongs to an
 * account takes the profile's first name, and the API says so. Its refusal
 * is the box's own (`extraFields`), under the box and tied to it, and the
 * box takes focus by script, never through the fragment: an anchor would
 * replace the token.
 *
 * ## Back from sign-in
 *
 * `linkOnArrival` is set when this tab went to sign in from "Link my reply
 * to my account". Once the session has been read as signed in, the link is
 * made without another tap, because that tap was the one that left; signed
 * out (sign-in given up), the offer is simply there again.
 */
export function GuestPlan({
  token,
  plan: first,
  linkOnArrival,
}: {
  token: string;
  plan: PlanView;
  linkOnArrival: boolean;
}) {
  const { signedIn } = useTravellerSession();
  const [plan, setPlan] = useState(first);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  // Set once a name was refused, and never cleared: see `askName`.
  const [nameRefused, setNameRefused] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkLine, setLinkLine] = useState<LinkLine | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // Counts the refusals that move focus to the name box.
  const [focusName, setFocusName] = useState(0);

  const [{ actions, now, put }] = useState(() => {
    let live = { plan: first, name: "", signedIn: false };
    const put = (next: Partial<typeof live>) => {
      live = { ...live, ...next };
    };
    return {
      now: () => live,
      put,
      actions: guestActions({
        token,
        current: () => live.plan,
        firstName: () => live.name,
        signedIn: () => live.signedIn,
        onPlan: (next) => {
          put({ plan: next });
          setPlan(next);
        },
        onNameRefused: (line) => {
          setNameError(line);
          if (!line) return;
          setNameRefused(true);
          setFocusName((n) => n + 1);
        },
      }),
    };
  });
  // The plan and the name go in where they are set (`onPlan`, the box's
  // `onChange`); a render's copy of either may be one behind them.
  useEffect(() => {
    put({ signedIn: signedIn === true });
  }, [put, signedIn]);

  // After the render that draws the refusal under the box.
  useEffect(() => {
    if (focusName) nameRef.current?.focus();
  }, [focusName]);

  /*
    The link made on arrival is pending from the moment there is a session
    to make it with until its line is in: worked out, not kept, so the
    effect that sends it sets no state of its own before the answer.
  */
  const arriving =
    linkOnArrival &&
    signedIn === true &&
    first.me !== undefined &&
    linkLine === null;
  const arrived = useRef(false);
  useEffect(() => {
    if (!linkOnArrival || arrived.current || signedIn !== true || !first.me)
      return;
    arrived.current = true;
    void actions
      .link()
      .then((result) => setLinkLine(linkLineFor(result, now().plan)));
  }, [actions, now, linkOnArrival, signedIn, first.me]);

  async function link() {
    if (linking || arriving) return;
    setLinking(true);
    setLinkLine(null);
    try {
      setLinkLine(linkLineFor(await actions.link(), now().plan));
    } finally {
      setLinking(false);
    }
  }

  /*
    Signed in, the profile's first name is used, unless the API refuses it
    (a first word that is not a name): then the box is drawn after all, with
    the refusal under it, and what is typed there is sent instead. Kept on
    screen from then on, as typing clears the line itself.
  */
  const askName =
    !plan.me && plan.canReply && (signedIn !== true || nameRefused);

  return (
    <PlanViewScreen
      plan={plan}
      actions={actions}
      mode="guest"
      signedIn={signedIn === true}
      extraFields={NAME_FIELD}
      formExtras={
        askName ? (
          <Field
            ref={nameRef}
            name="firstName"
            label={planWords.firstName}
            hint={planWords.firstNameHint}
            error={nameError ?? undefined}
            value={name}
            maxLength={30}
            autoComplete="given-name"
            autoCapitalize="words"
            spellCheck={false}
            onChange={(e) => {
              const typed = e.currentTarget.value;
              put({ name: typed });
              setName(typed);
              if (nameError) setNameError(null);
            }}
          />
        ) : null
      }
      footer={
        <GuestFooter
          token={token}
          plan={plan}
          actions={actions}
          signedIn={signedIn === true}
          linking={linking || arriving}
          linkLine={linkLine}
          onLink={link}
        />
      }
    />
  );
}

/** What "Link my reply to my account" came to, as the line under it. */
function linkLineFor(result: PlanActionResult, plan: PlanView): LinkLine {
  if (result.kind === "ok" || result.kind === "sent") {
    return { tone: "done", text: guestWords.linked };
  }
  if (result.kind === "gone")
    return { tone: "problem", text: planWords.closed };
  if (result.code === "unauthorized") {
    return { tone: "problem", text: guestWords.signInAgain };
  }
  return { tone: "problem", text: refusalLine(result, plan.planner.name) };
}
