"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  checkInDone,
  checkInRefusal,
  codeFromHash,
  codeReady,
  normaliseCode,
  CHECK_IN_CODE_MAX,
  type CheckInAnswer,
} from "@/lib/organisers/check-in";
import { DOOR_WORDS as D } from "@/lib/organisers/door-words";
import { organiserRefusal } from "@/lib/organisers/refusal";
import {
  useCheckIn,
  type CheckInVariables,
} from "@/lib/organisers/use-check-in";
import {
  DoorDoneLine,
  DoorProblemBlock,
  type DoorDone,
  type DoorProblem,
} from "./door-screen-parts";
import { BACK_TO_HUB, OrganiserHeading } from "./organiser-parts";

/**
 * The door (yuvoy-app#226, the web half of yuvoy-mobile#394): a helper or
 * owner of a verified organiser types the code from a guest's phone, or opens
 * the guest's `/door#CODE` link, and the guest is checked in. Behind the
 * organiser gate, so it renders only signed in with `supply` open.
 *
 * ## The code in the address
 *
 * The code rides in the fragment, which no server and no log sees. It is read
 * once, as the screen first renders (a lazy state), and sent once with
 * `via: "portal_link"` from an effect a ref guards, so Strict Mode's second
 * run and the gate's Activity showing the screen again send nothing. The
 * fragment is then cleared with `replaceState`, keeping the path and the
 * query (the mock scenario rides there), so a reload never sends it again.
 *
 * ## One request at a time
 *
 * `out` is set before the send and cleared when it settles, so a double tap
 * or a held Enter sends one request. The button is off while one is out and
 * while the field does not hold 8 to 12 code characters.
 *
 * ## What an answer leaves
 *
 * A 200 (an already used code too) shows the big line, clears the field and
 * puts the cursor back in it for the next guest. Every refusal keeps the
 * code. A 403 for age opens the gate's age step over this screen; a kept
 * answer sends the same code the same way once more (`last`). Try again does
 * the same for a pause, no signal or a fault. Nothing is queued.
 *
 * The answers are read from `mutateAsync`, not from per-call callbacks: those
 * do not run while the gate holds this screen hidden under the age step.
 */
export function DoorScreen() {
  const checkIn = useCheckIn();
  const { mutateAsync } = checkIn;
  const [fromHash] = useState<string | null>(() =>
    typeof window === "undefined" ? null : codeFromHash(window.location.hash),
  );
  const [code, setCode] = useState<string>(() => fromHash ?? "");
  const [done, setDone] = useState<DoorDone | null>(null);
  const [problem, setProblem] = useState<DoorProblem | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const out = useRef(false);
  const last = useRef<CheckInVariables | null>(null);
  const hashTaken = useRef(false);

  const answered = useCallback((answer: CheckInAnswer) => {
    setDone({ ...checkInDone(answer), already: answer.alreadyCheckedIn });
    setProblem(null);
    setCode("");
    input.current?.focus();
  }, []);

  const refused = useCallback((error: unknown) => {
    const outcome = checkInRefusal(error);
    setDone(null);
    if (outcome.kind === "age") {
      // A new object for each 403, so the gate opens its step for this one.
      const said = organiserRefusal(error);
      setProblem({
        kind: "age",
        refusal:
          said.kind === "age"
            ? said
            : { kind: "age", message: D.adultsOnly },
      });
      return;
    }
    setProblem(outcome);
  }, []);

  /** The one way a check-in is sent. No state is set here, only once it settles. */
  const post = useCallback(
    (body: CheckInVariables) => {
      if (out.current) return;
      out.current = true;
      last.current = body;
      void mutateAsync(body)
        .then(answered, refused)
        .finally(() => {
          out.current = false;
        });
    },
    [mutateAsync, answered, refused],
  );

  useEffect(() => {
    if (hashTaken.current) return;
    hashTaken.current = true;
    if (window.location.hash) {
      const { pathname, search } = window.location;
      window.history.replaceState(window.history.state, "", pathname + search);
    }
    if (fromHash) post({ code: fromHash, via: "portal_link" });
  }, [fromHash, post]);

  const again = useCallback(() => {
    const body = last.current;
    if (!body || out.current) return;
    setProblem(null);
    post(body);
  }, [post]);

  const ready = codeReady(code);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || out.current) return;
    setDone(null);
    setProblem(null);
    post({ code: normaliseCode(code), via: "typed" });
  };

  const onType = (value: string) => {
    setCode(value);
    if (done) setDone(null);
    if (problem?.kind === "refused") setProblem(null);
  };

  return (
    <Screen back={BACK_TO_HUB}>
      <OrganiserHeading>{D.title}</OrganiserHeading>

      {done ? <DoorDoneLine done={done} /> : null}

      <form className="mt-6" onSubmit={onSubmit} noValidate>
        <Field
          ref={input}
          label={D.field}
          name="code"
          value={code}
          onChange={(e) => onType(e.target.value)}
          error={problem?.kind === "refused" ? problem.message : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          // Room for a hyphen or a space between the halves.
          maxLength={CHECK_IN_CODE_MAX + 4}
          data-testid="door-code"
        />
        <Button
          type="submit"
          block
          className="mt-4"
          disabled={!ready || checkIn.isPending}
          data-testid="door-send"
        >
          {D.button}
        </Button>
      </form>

      {problem ? <DoorProblemBlock problem={problem} onAgain={again} /> : null}
    </Screen>
  );
}
