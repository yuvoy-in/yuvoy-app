"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { YuvoyError } from "@/lib/api/errors";
import { dedash } from "@/lib/format/dedash";
import { qk } from "@/lib/query/policy";
import { useEmailSignInOpen } from "@/lib/site/use-release";
import {
  useRequestSignInCode,
  useTravellerSession,
  type SignInWayIn,
} from "@/lib/auth/use-traveller";
import {
  ADD_WAY_WORDS as A,
  WAYS_IN_WORDS as W,
  canAddWay,
  readJoinedAccountAgain,
  showsWaysIn,
  useAddWay,
  useAddedAfterAll,
  waysIn,
  type WayKind,
} from "@/lib/auth/use-add-way";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { OwnForm } from "@/components/ui/own-form";
import { Panel } from "@/components/ui/panel";
import { DEFAULT_DIAL_CODE, PhoneField } from "@/components/ui/phone-field";
import { codeSentSentence } from "@/components/auth/sign-in-form";
import {
  EMAIL_SIGN_IN,
  emailProblem,
} from "@/components/auth/use-sign-in-flow";
import {
  addWayFailure,
  isPlainUnauthorized,
  type AddWayFailure,
} from "./add-way-failure";

/**
 * Ways in on Account (yuvoy-app#229, the web half of yuvoy-mobile#340): the
 * email and the number this account signs in with, and adding the kind it
 * lacks. Mobile puts this on its own page with a sheet; here it is a section
 * of Account with the form in place, since a web page has room for both.
 * The words are the mobile app's (`use-add-way`).
 */
export function WaysIn({ me }: { me: Parameters<typeof waysIn>[0] }) {
  const doorOpen = useEmailSignInOpen();
  const ways = waysIn(me);
  const [adding, setAdding] = useState<WayKind | null>(null);
  const [added, setAdded] = useState(false);
  const heading = useId();

  /*
    An open form stays, with whatever it says, until it is closed. The door
    shutting under it (the config read again after the API's own
    `sign_in_unavailable`) would otherwise take a number-only account's
    whole section away, the alert saying why with it (manager, 3 Nov 01:21).
  */
  if (!showsWaysIn(ways, doorOpen) && !added && adding === null) return null;

  const open = (kind: WayKind) => {
    setAdded(false);
    setAdding(kind);
  };

  const rows: Array<{ kind: WayKind; label: string; value: string | null }> = [
    {
      kind: "email",
      label: W.email,
      value: ways.email ? (ways.emailAddress ?? W.emailAdded) : null,
    },
    { kind: "phone", label: W.number, value: ways.phone },
  ];

  return (
    <Panel className="mt-6">
      <section aria-labelledby={heading}>
        <h2 id={heading} className="text-base font-bold">
          {W.title}
        </h2>
        <ul className="mt-3 space-y-3">
          {rows.map(({ kind, label, value }) =>
            value ? (
              <li key={kind} className="text-sm">
                <span className="text-forest/70">{label}</span>{" "}
                <span className="break-all">{value}</span>
              </li>
            ) : canAddWay(ways, kind, doorOpen) && adding !== kind ? (
              <li key={kind}>
                <Button variant="outline" size="sm" onClick={() => open(kind)}>
                  {kind === "email" ? W.addEmail : W.addNumber}
                </Button>
              </li>
            ) : null,
          )}
        </ul>
        <p className="text-forest/70 mt-3 text-sm">{W.foot}</p>

        {adding ? (
          <AddWay
            key={adding}
            kind={adding}
            onAdded={() => {
              setAdding(null);
              setAdded(true);
            }}
            onClose={() => setAdding(null)}
          />
        ) : null}

        {added ? (
          <p role="status" className="text-forest/80 mt-4 text-sm">
            {A.added}
          </p>
        ) : null}
      </section>
    </Panel>
  );
}

type Problem = { field: "email" | "phone" | "code"; sentence: string };

/** The two steps: where to send a code, then the code. */
function AddWay({
  kind,
  onAdded,
  onClose,
}: {
  kind: WayKind;
  onAdded: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { signOut } = useTravellerSession();
  const request = useRequestSignInCode();
  const add = useAddWay();
  const addedAfterAll = useAddedAfterAll();

  const [stage, setStage] = useState<"entry" | "code">("entry");
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [failure, setFailure] = useState<AddWayFailure | null>(null);
  const [checking, setChecking] = useState(false);

  const isEmail = kind === "email";
  const way = (): SignInWayIn =>
    isEmail ? { email: email.trim() } : { phone };

  /** What an answer tells the rest of the app. */
  function told(error: unknown) {
    if (!(error instanceof YuvoyError)) return;
    /*
      Only the API's own door-closed answer reads the config again, and the
      config alone says whether the door is shut. Any other 5xx, a bare 503
      included, is a passing failure and leaves the door as it was.
    */
    if (error.status === 503 && error.code === "sign_in_unavailable") {
      void qc.invalidateQueries({ queryKey: qk.appConfig() });
    }
    if (error.status === 409) {
      void qc.invalidateQueries({ queryKey: qk.myAccount() });
    }
  }

  function back() {
    setStage("entry");
    setCode("");
    setSentMessage(null);
    setDevCode(undefined);
    setProblem(null);
    setFailure(null);
    request.reset();
    add.reset();
  }

  async function askForCode() {
    setFailure(null);
    setProblem(null);
    setCode("");
    if (isEmail) {
      const sentence = emailProblem(email);
      if (sentence) {
        setProblem({ field: "email", sentence });
        return;
      }
    }
    try {
      const answer = await request.mutateAsync(way());
      setSentMessage(answer?.message ? dedash(answer.message) : null);
      setDevCode(answer?.devCode);
      setStage("code");
    } catch (error) {
      told(error);
      setFailure(addWayFailure(error, { way: kind, stage: "entry" }));
    }
  }

  async function submit() {
    setFailure(null);
    setProblem(null);
    try {
      await add.mutateAsync({ ...way(), code });
      onAdded();
      return;
    } catch (error) {
      told(error);
      if (isPlainUnauthorized(error)) {
        /*
          The code's, or the session's. The account read again through the
          proxy drops a dead cookie, and the session read after it then turns
          this screen into the sign-in form; a live session stays put.
        */
        void qc
          .invalidateQueries({ queryKey: qk.myAccount() })
          .then(() => qc.invalidateQueries({ queryKey: qk.session() }));
      } else if (!(error instanceof YuvoyError)) {
        // No answer came: the account says whether it was added after all.
        setChecking(true);
        const there = await addedAfterAll(kind);
        setChecking(false);
        if (there) {
          // The same reads as an add that was answered (useAddWay's onSuccess).
          void readJoinedAccountAgain(qc);
          onAdded();
          return;
        }
      }
      setFailure(addWayFailure(error, { way: kind, stage: "code" }));
    }
  }

  const fieldError = (field: Problem["field"]) =>
    problem?.field === field
      ? problem.sentence
      : failure?.field === field
        ? failure.body
        : undefined;

  const busy = request.isPending || add.isPending || checking;
  const blocked =
    busy ||
    (stage === "code" && code.trim().length === 0) ||
    (stage === "entry" && !isEmail && phone.replace(/\D/g, "").length <= 4);
  const change = isEmail ? EMAIL_SIGN_IN.useAnother : "Use another number";

  return (
    <div className="border-forest/10 mt-5 border-t pt-5">
      <h3 className="text-sm font-bold">
        {stage === "code" && isEmail ? "Check your email" : A.title[kind]}
      </h3>
      <p className="text-forest/70 mt-1 text-sm">
        {stage === "entry" ? (
          A.sentence
        ) : isEmail ? (
          <>
            {EMAIL_SIGN_IN.sentLead}
            <strong className="text-forest font-bold">{email.trim()}</strong>
            {EMAIL_SIGN_IN.sentTail}
          </>
        ) : (
          codeSentSentence({ sentMessage })
        )}
      </p>

      <OwnForm
        key={stage}
        className="mt-4 space-y-4"
        /* Our own checks (emailProblem), not the browser's bubble. */
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (stage === "code") void submit();
          else void askForCode();
        }}
      >
        {(form) => (
          <>
            {stage === "code" ? (
              <Field
                form={form}
                label={A.codeLabel}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setProblem(null);
                }}
                className="font-mono"
                error={fieldError("code")}
                hint={
                  devCode
                    ? `Development build: the code is ${devCode}.`
                    : isEmail
                      ? EMAIL_SIGN_IN.codeHint
                      : undefined
                }
                autoFocus
                required
              />
            ) : isEmail ? (
              <Field
                form={form}
                label={A.emailLabel}
                placeholder={EMAIL_SIGN_IN.placeholder}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setProblem(null);
                }}
                error={fieldError("email")}
                autoFocus
                required
              />
            ) : (
              <PhoneField
                form={form}
                label={W.number}
                value={phone}
                onChange={(next) => {
                  setPhone(next);
                  setProblem(null);
                }}
                error={fieldError("phone")}
                autoFocus
                required
              />
            )}
            <Button form={form} type="submit" block disabled={blocked}>
              {request.isPending
                ? "Sending a code…"
                : checking
                  ? "Checking…"
                  : add.isPending
                    ? "Adding…"
                    : stage === "code"
                      ? A.submit[kind]
                      : "Send me a code"}
            </Button>
          </>
        )}
      </OwnForm>

      <div className="mt-3 flex flex-wrap gap-3">
        {stage === "code" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={back}>
            {change}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          {A.cancel}
        </Button>
      </div>

      {failure && !failure.field ? (
        <Panel role="alert" className="mt-4">
          <p className="text-sm font-bold">{failure.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
          {failure.action ? (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={
                  failure.action === "change"
                    ? back
                    : failure.action === "sign-out"
                      ? () => void signOut()
                      : onClose
                }
              >
                {failure.action === "change"
                  ? change
                  : failure.action === "sign-out"
                    ? "Sign out and sign in again"
                    : "Close"}
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
