"use client";

import { useRef, useState } from "react";
import { YuvoyError, NetworkError } from "@/lib/api/errors";
import { describeError, type DescribedError } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { OwnForm } from "@/components/ui/own-form";
import { Panel } from "@/components/ui/panel";
import {
  useRedeemInviteCode,
  type RedeemAnswer,
} from "@/lib/auth/use-invite-code";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useChangedBeforeHydration } from "@/lib/react/use-changed-before-hydration";
import {
  INVITE_CODE_EXAMPLE,
  formatInviteCode,
  inviteCodeProblem,
  inviteCodeProblemSentence,
  isInviteCode,
} from "@/lib/auth/invite-code";

/*
  The code form the gate's code screen draws, and the Account screen too.
  Moved here from `invite-gate.tsx` (yuvoy-app#243) as it was; that file
  still exports both from its own path.
*/

/**
 * One field, checked before it is sent, and every refusal in its own words.
 *
 * Exported for the Account screen's "Enter your invite code", which opens the
 * same form rather than a second one.
 */
export function InviteCodeForm({
  autoFocus,
  onSessionEnded,
  onAdmitted,
}: {
  autoFocus?: boolean;
  /** The API answered 401: the session is over, and signing in again is next. */
  onSessionEnded?: () => void;
  onAdmitted?: (answer: RedeemAnswer) => void;
}) {
  const redeem = useRedeemInviteCode();
  const { refresh: recheckSession } = useTravellerSession();
  const [value, setValue] = useState("");
  /** Why what was typed cannot be a code: said at once, and never sent. */
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * A synchronous guard against the fast double-tap, as checkout has: the
   * pending flag is React state and is not true until a re-render, and a
   * second POST is a second throttled attempt.
   */
  const submitting = useRef(false);
  /*
    Typed before the page hydrated. The server draws this for a number not
    yet let in, and on a slow link a code typed then was on screen and sent
    as nothing (the stability pass, 6 Oct 2026).
  */
  const box = useRef<HTMLInputElement>(null);
  useChangedBeforeHydration(box, ([field]) => setValue(field.value));

  async function submit() {
    if (submitting.current) return;
    const local = inviteCodeProblem(value);
    if (local) {
      setProblem(inviteCodeProblemSentence(local));
      return;
    }
    setProblem(null);
    setValue(formatInviteCode(value));
    submitting.current = true;
    try {
      const answer = await redeem.mutateAsync(value);
      onAdmitted?.(answer);
    } catch (error) {
      /*
        Swallowed here and nowhere else: `mutateAsync` rejects AND stores the
        failure on `redeem.error`, which is what renders it below.

        A 401 is the one worth acting on. The proxy has already dropped the
        cookie, so the cached "signed in" is stale; asking again turns this
        screen back into sign-in, with a line saying why.
      */
      if (error instanceof YuvoyError && error.status === 401) {
        onSessionEnded?.();
        await recheckSession();
      }
    } finally {
      submitting.current = false;
    }
  }

  const failure = redeemFailure(redeem.error);

  if (redeem.isSuccess) {
    return (
      <p role="status" className="text-forest mt-6 text-sm font-bold">
        {redeem.data?.alreadyAdmitted
          ? "You were already in, so your code was not used."
          : "Code accepted. You are in."}
      </p>
    );
  }

  return (
    <OwnForm
      className="mt-6 space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        /*
          This form is drawn inside checkout's own form (`variant="panel"`).
          `OwnForm` keeps it out of that form in the DOM (see its note), and
          this keeps the submit out of it in React's tree: a portal's events
          still bubble through the components that drew it, and "Use this
          code" would otherwise also run the Hold these seats handler and try
          to book the very reservation the gate has just refused.
        */
        e.stopPropagation();
        void submit();
      }}
    >
      {(form) => (
        <>
          <Field
            ref={box}
            form={form}
            label="Invite code"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setProblem(null);
              if (redeem.error) redeem.reset();
            }}
            onBlur={() => {
              // Shown the way codes are written, once it is one.
              if (isInviteCode(value)) setValue(formatInviteCode(value));
            }}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={32}
            className="font-mono"
            hint={`8 letters and numbers, like ${INVITE_CODE_EXAMPLE}. Capitals, spaces and the hyphen do not matter.`}
            error={problem ?? failure?.onField}
            autoFocus={autoFocus}
            required
          />

          <Button
            form={form}
            type="submit"
            size="lg"
            block
            disabled={redeem.isPending || value.trim().length === 0}
          >
            {redeem.isPending ? "Checking your code…" : "Use this code"}
          </Button>

          {failure?.panel ? (
            <Panel tone="alert" role="alert">
              <p className="text-sm font-bold">{failure.panel.title}</p>
              <p className="text-forest/70 mt-1.5 text-sm">
                {failure.panel.body}
              </p>
              {failure.panel.requestId ? (
                <p className="text-forest/70 mt-3 font-mono text-[10px]">
                  {failure.panel.requestId}
                </p>
              ) : null}
            </Panel>
          ) : null}
        </>
      )}
    </OwnForm>
  );
}

/**
 * A refused redeem, in words, and where the words go.
 *
 * The three refusals of the code itself (unknown, used, expired) and a code
 * the API calls malformed belong ON the field: they are about what was typed,
 * and that is where the eye and a screen reader already are. Everything else
 * (too many tries, no signal, us) is about the attempt, not the code, and is
 * said in a panel beneath, with what was typed left exactly as it was.
 *
 * A 401 has no sentence here: the screen becomes sign-in and says why there.
 */
export function redeemFailure(error: unknown): {
  onField?: string;
  panel?: Pick<DescribedError, "title" | "body" | "requestId">;
} | null {
  if (!error) return null;

  if (error instanceof NetworkError) {
    return {
      panel: {
        title: "No connection",
        body: "We could not reach Yuvoy. This is usually a weak signal rather than you. Your code is still here, so try again when you have signal.",
      },
    };
  }

  if (!(error instanceof YuvoyError)) {
    return {
      panel: {
        title: "Something went wrong",
        body: "That did not work. Your code is still here, so try again in a moment.",
      },
    };
  }

  if (error.status === 401) return null;

  if (error.status === 429 || error.code === "rate_limited") {
    return {
      panel: {
        title: "Too many tries for now",
        body: "To keep codes safe, each account can try only a few an hour. Wait a while, up to an hour, then try again. Nothing is wrong with your account.",
        requestId: error.requestId,
      },
    };
  }

  switch (error.code) {
    case "invite_code_unknown":
    case "invite_code_used":
    case "invite_code_expired": {
      const said = describeError(error);
      return { onField: `${said.title}. ${said.body}` };
    }
    case "invalid_input":
      return {
        onField:
          "That cannot be a code. Check it against the one you were given.",
      };
    default:
      return {
        panel: {
          title: "Something went wrong",
          body: "That did not work. It is us, not you. Your code is still here, so try again in a moment.",
          requestId: error.requestId,
        },
      };
  }
}
