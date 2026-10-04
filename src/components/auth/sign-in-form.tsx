"use client";

import { useRef, useState, type ReactNode } from "react";
import { YuvoyError } from "@/lib/api/errors";
import { dedash } from "@/lib/format/dedash";
import {
  useTravellerSession,
  useRequestSignInCode,
  useVerifySignInCode,
} from "@/lib/auth/use-traveller";
import { Field } from "@/components/ui/field";
import { OwnForm } from "@/components/ui/own-form";
import { PhoneField, DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useListMotion } from "@/lib/motion/use-list-motion";

/**
 * Signing in with a number and a code: the steps, wherever they are asked
 * for.
 *
 * Lifted out of the Account screen, unchanged, so the invite gate
 * (yuvoy-api#195) can ask for them in place rather than send somebody to
 * `/account` and back. That matters most at checkout: a traveller refused with
 * `403 invite_required` has a whole form filled in, and a round trip through
 * another page would throw it away. One set of steps also means one set of
 * sentences for every failure, rather than a second copy that drifts.
 *
 * The screen around the steps (its heading, what it says above them, where it
 * goes afterwards) stays the caller's. That is the part that differs.
 */
export function useSignInFlow() {
  const { signIn } = useTravellerSession();
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  const request = useRequestSignInCode();
  const verify = useVerifySignInCode();

  const phoneGiven = phone.replace(/\D/g, "").length > 4;

  async function askForCode(again = false) {
    verify.reset();
    setCode("");
    const answer = await request.mutateAsync(phone).catch(() => null);
    if (!answer) return;
    setSent(true);
    setSentMessage(answer.message ? dedash(answer.message) : null);
    setDevCode(answer.devCode);
    setResent(again);
  }

  /**
   * `true` once the session exists and every per-number cache has been told.
   *
   * The answer carries no token, only `{ signedIn: true }`. The session is
   * already in an HttpOnly cookie by the time this resolves, because
   * `POST /api/session` set it server-side (yuvoy-app#57).
   */
  async function submitCode(): Promise<boolean> {
    const answer = await verify.mutateAsync({ phone, code }).catch(() => null);
    if (!answer?.signedIn) return false;
    await signIn();
    setSent(false);
    setSentMessage(null);
    setCode("");
    return true;
  }

  function changeNumber() {
    setSent(false);
    setSentMessage(null);
    setCode("");
    setDevCode(undefined);
    setResent(false);
    request.reset();
    verify.reset();
  }

  return {
    phone,
    setPhone,
    code,
    setCode,
    sent,
    sentMessage,
    devCode,
    resent,
    request,
    verify,
    phoneGiven,
    failure: signInFailure(verify.error ?? request.error, sent),
    askForCode,
    submitCode,
    changeNumber,
  };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;

/**
 * What a screen says once a code has been asked for: the API's own sentence.
 *
 * Since yuvoy-api#254 a code goes by email to the address on the number's
 * latest booking (there is no WhatsApp sender yet), and a number with no
 * booking is sent nothing, which the answer must not reveal. The API words
 * its `message` to hold for every number and will reword it when delivery
 * changes, so the screens print it rather than a promise of their own.
 * "Check your WhatsApp" was one of those, and it stopped being true.
 *
 * The fallback only covers an answer with no `message`, which the contract
 * does not allow, and it promises nothing either.
 */
export function codeSentSentence(flow: Pick<SignInFlow, "sentMessage">) {
  const said = flow.sentMessage?.trim() || CODE_MAY_COME;
  return `${/[.!?]$/.test(said) ? said : `${said}.`} It is good for a few minutes.`;
}

const CODE_MAY_COME = "If this number can get a code, it is on its way.";

/**
 * The form, the two ways out of the code step, and what went wrong.
 *
 * `onSignedIn` runs after the session exists. On Account that is where the
 * `?next=` redirect happens; in the gate it is where the page catches up.
 */
export function SignInSteps({
  flow,
  submitLabel,
  onSignedIn,
  autoFocusPhone,
}: {
  flow: SignInFlow;
  /** What the code step's button says. Account's is "Show me my trips". */
  submitLabel: string;
  onSignedIn?: () => void | Promise<void>;
  /** For steps revealed by a tap, so the keyboard lands where the eye does. */
  autoFocusPhone?: boolean;
}) {
  const {
    phone,
    setPhone,
    code,
    setCode,
    sent,
    devCode,
    resent,
    request,
    verify,
    phoneGiven,
    failure,
  } = flow;

  async function submit() {
    if (await flow.submitCode()) await onSignedIn?.();
  }

  /*
    A REFUSED NUMBER ARRIVES, IT DOES NOT SHOVE (T16 A, approved 4 Oct 2026).
    The reason fades in rising 4px (the field's own error) and the button
    under it glides down to make room (200ms on `move`), rather than jumping
    a line or two under the thumb that just pressed it. When the reason goes
    (the next send), it fades where it was (100ms) and the button glides back
    one step later. Each step is its own form, so the swap from the number to
    the code is what it always was.
  */
  const steps = useRef<HTMLElement | null>(null);
  useListMotion(steps, failure ? `${failure.field}:${failure.body}` : "", {
    arrive: "fade",
    byNode: true,
  });

  return (
    <>
      <OwnForm
        key={sent ? "code" : "phone"}
        ref={steps}
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          /*
            These steps are asked for INSIDE checkout's form too (yuvoy-api#195).
            `OwnForm` keeps the DOM honest there (no form nested in a form, see
            its note), and this keeps React's tree honest: a portal's events
            still bubble through the components that drew it, so without this
            the submit would reach the Hold these seats handler and try to book.
          */
          e.stopPropagation();
          if (sent) void submit();
          else void flow.askForCode();
        }}
      >
        {(form) => (
          <>
            {sent ? (
              <Field
                form={form}
                label="The code we sent"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono"
                error={failure?.field === "code" ? failure.body : undefined}
                hint={
                  devCode
                    ? `Development build: the code is ${devCode}.`
                    : undefined
                }
                autoFocus
                required
              />
            ) : (
              <PhoneField
                form={form}
                label="Your WhatsApp number"
                value={phone}
                onChange={setPhone}
                error={failure?.field === "phone" ? failure.body : undefined}
                hint="The number you book with."
                autoFocus={autoFocusPhone}
                required
              />
            )}

            <Button
              form={form}
              type="submit"
              size="lg"
              block
              disabled={
                request.isPending ||
                verify.isPending ||
                (sent ? code.trim().length === 0 : !phoneGiven)
              }
            >
              {request.isPending
                ? "Sending a code…"
                : verify.isPending
                  ? "Signing you in…"
                  : sent
                    ? submitLabel
                    : "Send me a code"}
            </Button>
          </>
        )}
      </OwnForm>

      {/*
        THE TWO WAYS OUT, as buttons rather than small print (yuvoy-app#34).

        "The owner took a while to find both." They were two underlined words
        inside a sentence of 12px grey text, and the number field was simply
        disabled once a code had been sent, so a wrong number had no visible
        way back at all.
      */}
      {sent ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={request.isPending}
            onClick={() => void flow.askForCode(true)}
          >
            {request.isPending ? "Sending…" : "Send another code"}
          </Button>
          <Button variant="outline" onClick={flow.changeNumber}>
            Change number
          </Button>
        </div>
      ) : null}

      {resent && !failure ? (
        <p role="status" className="text-forest/70 mt-4 text-xs">
          A new code was requested. The older one stops working.
        </p>
      ) : null}

      {/*
        The failure, said as a product rather than a stub. `signInFailure` is
        what turns a code into a sentence; a message attached to the FIELD it
        concerns is rendered on the field instead of here, so it is beside the
        thing to change rather than below the button.
      */}
      {failure && !failure.field ? (
        <Panel role="alert" className="mt-6">
          <p className="text-sm font-bold">{failure.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
          {failure.action ? <div className="mt-4">{failure.action}</div> : null}
        </Panel>
      ) : null}
    </>
  );
}

/**
 * What went wrong, as something a person can act on.
 *
 * The owner's words about what was here: "just basic AI generated, make it
 * proper. Say what happened, what to do next and where, with the field it
 * concerns."
 *
 * So each branch answers three things (what happened, what to do, and which
 * field to do it in), and `field` is what puts the sentence beside the input
 * rather than in a panel below the button.
 *
 * The generic `describeError` is deliberately not used here. It is written for
 * a booking that may have taken money, and its vocabulary ("this link no
 * longer opens anything") is wrong for somebody who has typed six digits.
 */
export function signInFailure(
  error: unknown,
  sent: boolean,
): {
  title: string;
  body: string;
  /** Renders on that field instead of in a panel. */
  field?: "phone" | "code";
  action?: ReactNode;
} | null {
  if (!error) return null;

  const code = error instanceof YuvoyError ? error.code : null;
  const status = error instanceof YuvoyError ? error.status : null;

  if (status === 429) {
    return {
      title: "Too many tries",
      body: "We have stopped sending codes to this number for a few minutes. Nothing is wrong with your account. Wait a moment and ask for another.",
    };
  }

  if (status === 401) {
    /*
      "Wrong, expired, used and over-attempted codes all answer 401 with one
      message." So this cannot say WHICH, and must not guess, but it can say
      the three things that are true of all four, and offer the way out.
    */
    return {
      title: "That code did not work",
      body: "It may be wrong, it may have expired, or it may already have been used. Ask for a new one and try again.",
      field: "code",
    };
  }

  if (status === 400 || code === "invalid_input") {
    return sent
      ? {
          title: "That does not look like the code",
          body: "It is six digits, from the message we sent.",
          field: "code",
        }
      : {
          title: "That number did not go through",
          body: "Check the country code and the digits. An Indian mobile is ten digits after +91.",
          field: "phone",
        };
  }

  /*
    Everything else: the network, or us. Not the traveller's fault and not
    their problem to diagnose, so it says so and offers the one thing that
    still works with no session at all.
  */
  return {
    title: "We could not connect",
    body: "That is our side or the island signal, not your number. Try again in a moment.",
    action: (
      <ButtonLink href="/trips" variant="outline" size="sm">
        Go to my trips
      </ButtonLink>
    ),
  };
}
