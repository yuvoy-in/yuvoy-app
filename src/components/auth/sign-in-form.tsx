"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BIRTH_YEAR_WORDS } from "@/lib/auth/birth-year";
import { Field } from "@/components/ui/field";
import { OwnForm } from "@/components/ui/own-form";
import { PhoneField } from "@/components/ui/phone-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useListMotion } from "@/lib/motion/use-list-motion";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/support/phone";
import { YearFields } from "./year-fields";
import {
  EMAIL_SIGN_IN,
  useSignInFlow,
  type SignInField,
  type SignInFlow,
} from "./use-sign-in-flow";

/**
 * Signing in with a number or an email and a code: the steps, wherever they
 * are asked for.
 *
 * Lifted out of the Account screen so the invite gate (yuvoy-api#195) can ask
 * for them in place rather than send somebody to `/account` and back. That
 * matters most at checkout: a traveller refused with `403 invite_required` has
 * a whole form filled in, and a round trip through another page would throw
 * it away. One set of steps also means one set of sentences for every failure,
 * rather than a second copy that drifts.
 *
 * The screen around the steps (what it says before anything is typed, where it
 * goes afterwards) stays the caller's; `signInHeading` and `signInSentence`
 * give it the words for the step the flow is on. The state is
 * `useSignInFlow` (the email door and the year, yuvoy-app#229).
 */
export { useSignInFlow, type SignInFlow };

/**
 * What a screen says once a code has been asked for by number: the API's own
 * sentence.
 *
 * A code goes by email (there is no WhatsApp sender yet), and since
 * yuvoy-api#303 only to an address given while signed in as the number, on
 * Account or with an invitation (yuvoy-api#195), never to one typed at a guest
 * checkout. A number with none is sent nothing, which the answer must not
 * reveal. The API words its `message` to hold for every number and will
 * reword it when delivery changes, so the screens print it rather than a
 * promise of their own. "Check your WhatsApp" was one of those, and it
 * stopped being true.
 *
 * The fallback only covers an answer with no `message`, which the contract
 * does not allow, and it promises nothing either.
 *
 * What follows it is true of every code (yuvoy-app#125): it lasts a few
 * minutes and works once. Not the exact window, which the server decides and
 * the email states.
 */
export function codeSentSentence(flow: Pick<SignInFlow, "sentMessage">) {
  const said = flow.sentMessage?.trim() || CODE_MAY_COME;
  return `${/[.!?]$/.test(said) ? said : `${said}.`} It is good for a few minutes and works once.`;
}

const CODE_MAY_COME = "If this number can get a code, it is on its way.";

/**
 * The screen's heading for the step the flow is on: `entry` is the caller's
 * (Account's "Sign in"). Empty on the under step, which says it itself.
 *
 * "Check your email" is where to look, not a claim that anything went
 * (yuvoy-app#125): codes go by email until there is a WhatsApp sender.
 */
export function signInHeading(
  flow: Pick<SignInFlow, "stage" | "way">,
  entry: string,
): string {
  switch (flow.stage) {
    case "doors":
      return entry;
    case "entry":
      return flow.way === "email" ? EMAIL_SIGN_IN.heading : entry;
    case "code":
      return "Check your email";
    case "year":
      return BIRTH_YEAR_WORDS.heading;
    case "under":
      return "";
  }
}

/**
 * The sentence under the heading for the step the flow is on: `intro` is the
 * caller's, before anything is sent. Null on the under step.
 */
export function signInSentence(
  flow: Pick<SignInFlow, "stage" | "way" | "email" | "sentMessage">,
  intro: ReactNode,
): ReactNode {
  switch (flow.stage) {
    case "doors":
      return intro;
    case "entry":
      return flow.way === "email" ? EMAIL_SIGN_IN.sentence : intro;
    case "code":
      return flow.way === "email" ? (
        <>
          {EMAIL_SIGN_IN.sentLead}
          <strong className="text-forest font-bold">{flow.email.trim()}</strong>
          {EMAIL_SIGN_IN.sentTail}
        </>
      ) : (
        codeSentSentence(flow)
      );
    case "year":
      return BIRTH_YEAR_WORDS.sentence;
    case "under":
      return null;
  }
}

/** What a field shows: what is missing, ours, or the API's sentence about it. */
function fieldSentence(flow: SignInFlow, field: SignInField) {
  if (flow.problem?.field === field) return flow.problem.sentence;
  return flow.failure?.field === field ? flow.failure.body : undefined;
}

/**
 * The form, the ways out of the code step, and what went wrong.
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
  const { way, stage, request, verify, failure } = flow;
  const email = way === "email";

  async function submit() {
    if (await flow.submitCode()) await onSignedIn?.();
  }

  /*
    A REFUSED NUMBER ARRIVES, IT DOES NOT SHOVE (T16 A, approved 4 Oct 2026).
    The reason fades in rising 4px (the field's own error) and the button
    under it glides down to make room (200ms on `move`), rather than jumping
    a line or two under the thumb that just pressed it. When the reason goes
    (the next send), it fades where it was (100ms) and the button glides back
    one step later. Each step is its own form, so the swap from one step to
    the next is what it always was.
  */
  const steps = useRef<HTMLElement | null>(null);
  const said = flow.problem ?? failure;
  useListMotion(
    steps,
    said
      ? `${said.field}:${"sentence" in said ? said.sentence : said.body}`
      : "",
    { arrive: "fade", byNode: true },
  );

  if (stage === "under") return <UnderStep sentence={flow.underSentence} />;

  if (stage === "doors") {
    /*
      THE TWO DOORS, email first as the mobile app's are (yuvoy-mobile#340).
      Only while `features.signIn.email` is on; the number has no switch.
    */
    return (
      <div className="mt-8 space-y-3">
        <Button size="lg" block onClick={() => flow.chooseWay("email")}>
          {EMAIL_SIGN_IN.door}
        </Button>
        <Button
          variant="outline"
          size="lg"
          block
          onClick={() => flow.chooseWay("phone")}
        >
          {EMAIL_SIGN_IN.phoneDoor}
        </Button>
      </div>
    );
  }

  const sent = flow.sent;
  const blocked =
    request.isPending ||
    verify.isPending ||
    (stage === "code" && flow.code.trim().length === 0) ||
    (stage === "entry" && !email && !flow.phoneGiven);

  return (
    <>
      {/*
        `noValidate`: the steps check their own fields and say why on the
        field, so the browser's bubble never stops "asha@" before our
        sentence can show (`emailProblem`, the year and the button's block).
      */}
      <OwnForm
        key={stage}
        ref={steps}
        className="mt-8 space-y-5"
        noValidate
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
            {stage === "year" ? (
              <YearFields
                form={form}
                typed={flow.typedYear}
                onTyped={flow.setYear}
                birthday={flow.birthday}
                onBirthday={flow.setBirthday}
                askBirthday={flow.askBirthday}
                problem={yearProblem(flow)}
                autoFocus
              />
            ) : stage === "code" ? (
              /*
                NOT "The code we sent" (yuvoy-app#125). A number with no
                booking is sent nothing, and the API words its answer so it
                never says otherwise; a label claiming a send would tell
                anybody that this number has booked. "Sign-in" also keeps it
                apart from the gate's "Invite code", asked for on the next
                step.

                The number's hint is for whoever gets nothing, under the box
                where they are waiting: the things that still work, a number
                that has booked, a number an invitation was given for
                (yuvoy-api#195, 10 Oct 2026), and a person on the phone. The
                email's is the mobile app's: the spam folder, or another code.
              */
              <Field
                form={form}
                label="Sign-in code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={flow.code}
                onChange={(e) => flow.setCode(e.target.value)}
                className="font-mono"
                error={fieldSentence(flow, "code")}
                hint={
                  <>
                    {flow.devCode
                      ? `Development build: the code is ${flow.devCode}. `
                      : null}
                    {email ? (
                      EMAIL_SIGN_IN.codeHint
                    ) : (
                      <>
                        No email? Use the number you booked with or were invited
                        on, or call us on{" "}
                        <a
                          href={SUPPORT_PHONE_HREF}
                          className="text-terra-deep tap-target whitespace-nowrap underline"
                        >
                          {SUPPORT_PHONE}
                        </a>
                        .
                      </>
                    )}
                  </>
                }
                autoFocus
                required
              />
            ) : email ? (
              <Field
                form={form}
                label={EMAIL_SIGN_IN.label}
                placeholder={EMAIL_SIGN_IN.placeholder}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={flow.email}
                onChange={(e) => flow.setEmail(e.target.value)}
                error={fieldSentence(flow, "email")}
                autoFocus
                required
              />
            ) : (
              <PhoneField
                form={form}
                label="Your WhatsApp number"
                value={flow.phone}
                onChange={flow.setPhone}
                error={fieldSentence(flow, "phone")}
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
              disabled={blocked}
            >
              {request.isPending
                ? "Sending a code…"
                : verify.isPending
                  ? "Signing you in…"
                  : stage === "year"
                    ? "Continue"
                    : stage === "code"
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
            {email ? EMAIL_SIGN_IN.useAnother : "Change number"}
          </Button>
        </div>
      ) : flow.emailOpen ? (
        <p className="mt-6">
          <button
            type="button"
            className="text-terra-deep tap-target text-sm underline"
            onClick={() => flow.chooseWay(email ? "phone" : "email")}
          >
            {email ? EMAIL_SIGN_IN.useNumber : EMAIL_SIGN_IN.useEmail}
          </button>
        </p>
      ) : null}

      {flow.resent && !failure ? (
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
          {failure.offer === "use-number" ? (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => flow.chooseWay("phone")}
              >
                {EMAIL_SIGN_IN.useNumber}
              </Button>
            </div>
          ) : failure.action ? (
            <div className="mt-4">{failure.action}</div>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}

/** The year step's sentence on its field: ours before sending, else the API's. */
function yearProblem(flow: SignInFlow) {
  for (const field of ["year", "birthday"] as const) {
    const sentence = fieldSentence(flow, field);
    if (sentence) return { field, sentence };
  }
  return null;
}

/**
 * Under 18 (`403 under_age_sign_up`): nothing was made and the code is spent.
 * The sentence is the API's when it sends one, said as the heading and read
 * out once, and the one way on is to keep looking without an account.
 */
function UnderStep({ sentence }: { sentence: string }) {
  const words = useRef<HTMLParagraphElement>(null);
  useEffect(() => words.current?.focus(), []);
  return (
    <div className="mt-2">
      <p
        ref={words}
        role="alert"
        tabIndex={-1}
        className="font-display tracking-display leading-display text-2xl text-balance outline-none"
      >
        {sentence}
      </p>
      <ButtonLink href="/" size="lg" block className="mt-8">
        Look around
      </ButtonLink>
    </div>
  );
}
