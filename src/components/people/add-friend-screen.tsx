"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import {
  isPeopleClosed,
  needsAge,
  needsName,
  useLookupFriendLink,
  useRequestFriend,
  type LinkLookup,
} from "@/lib/people/use-people";
import {
  PEOPLE_WORDS,
  friendCode,
  type PersonRef,
} from "@/lib/people/people-words";
import { isDeadToken } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/states";
import { AgeStep } from "./age-step";
import { NameStep } from "./name-step";
import {
  Initial,
  Refusal,
  UnderAgeClosed,
  isStepRefusal,
  refusalText,
} from "./people-parts";

const W = PEOPLE_WORDS.add;

/**
 * `/add/{code}`, where a friend link opens (yuvoy-app#222).
 *
 * The lookup is session only, so signed out the page asks to sign in and
 * comes back, and says nothing about whose link it is. The code is read with
 * `friendCode` (any case, hyphen optional); one that cannot be a code says the
 * link doesn't work without asking the API.
 *
 * Sending is `requestFriend` `{via: "friend_link", code}`. Its `202` is
 * always "Request sent", whatever happened behind it, unless it answers
 * `friends` (they had already asked). `request_in` is answered the same way:
 * asking back somebody who asked is what makes two people friends.
 */
export function AddFriendScreen({ raw }: { raw: string }) {
  const qc = useQueryClient();
  const { signedIn, signOut } = useTravellerSession();
  const code = friendCode(raw);
  const lookup = useLookupFriendLink(code, signedIn === true);
  const [closed, setClosed] = useState<string | null>(null);

  const sessionEnded = lookup.isLoadingError && isDeadToken(lookup.error);
  useEffect(() => {
    if (sessionEnded) void qc.invalidateQueries({ queryKey: qk.session() });
  }, [sessionEnded, qc]);

  if (closed) {
    return (
      <Shell>
        <UnderAgeClosed message={closed} />
      </Shell>
    );
  }

  if (signedIn === undefined) return <Loading />;

  if (!signedIn) {
    return (
      <Shell>
        <Title>{W.signedOut.title}</Title>
        <Body>{W.signedOut.body}</Body>
        <ButtonLink
          href={`/account?next=/add/${encodeURIComponent(raw)}`}
          size="lg"
          className="mt-6"
        >
          {W.signedOut.action}
        </ButtonLink>
      </Shell>
    );
  }

  if (code === null) return <Unavailable />;

  if (lookup.isPending || sessionEnded) return <Loading />;

  if (lookup.isLoadingError) {
    if (isPeopleClosed(lookup.error)) {
      return (
        <Shell>
          <Title>{PEOPLE_WORDS.closed.title}</Title>
          <Body>{PEOPLE_WORDS.closed.body}</Body>
        </Shell>
      );
    }
    return (
      <Shell>
        <div role="alert">
          <Title>{W.failed}</Title>
          <Body>{refusalText(lookup.error)}</Body>
        </div>
        <Button
          size="lg"
          className="mt-6"
          pending={lookup.isFetching}
          pendingLabel={PEOPLE_WORDS.retrying}
          onClick={() => void lookup.refetch()}
        >
          {PEOPLE_WORDS.retry}
        </Button>
      </Shell>
    );
  }

  const found = lookup.data;
  if (found.state === "expired" || found.state === "full") {
    const words = found.state === "expired" ? W.expired : W.full;
    return (
      <Shell>
        <Title>{words.title}</Title>
        <Body>{words.body}</Body>
      </Shell>
    );
  }
  if (found.state !== "ok" || !found.owner) return <Unavailable />;

  return (
    <Shell>
      <LinkOwner
        code={code}
        owner={found.owner}
        relation={found.relation ?? "none"}
        onUnderAge={(message) => {
          setClosed(message);
          void signOut();
        }}
      />
    </Shell>
  );
}

type Relation = NonNullable<LinkLookup["relation"]>;

function LinkOwner({
  code,
  owner,
  relation,
  onUnderAge,
}: {
  code: string;
  owner: PersonRef;
  relation: Relation;
  onUnderAge: (message: string) => void;
}) {
  const ask = useRequestFriend();
  const [step, setStep] = useState<"age" | "name" | null>(null);

  if (step === "age") {
    return <AgeStep onDone={() => setStep(null)} onUnderAge={onUnderAge} />;
  }
  if (step === "name") return <NameStep onDone={() => setStep(null)} />;

  const send = () =>
    ask.mutate(code, {
      onError: (error) => {
        if (needsAge(error)) setStep("age");
        else if (needsName(error)) setStep("name");
      },
    });

  // What the latest answer makes true, over what the lookup said before it.
  const now: Relation = ask.data
    ? ask.data.state === "friends"
      ? "friends"
      : "requested"
    : relation;

  if (now === "self") {
    return (
      <>
        <Title>{W.self}</Title>
        <Body>{W.selfBody}</Body>
        <ButtonLink href="/people" size="lg" className="mt-6">
          {W.toPeople}
        </ButtonLink>
      </>
    );
  }

  const shown =
    now === "friends" ? (owner.firstName ?? owner.shortName) : owner.shortName;
  const heading =
    now === "friends"
      ? shown
      : now === "request_in"
        ? W.acceptIn(owner.shortName)
        : W.asks(owner.shortName);

  return (
    <>
      <div className="mb-4">
        <Initial initial={owner.initial} size="lg" />
      </div>
      <Title>{heading}</Title>
      <Body>{now === "friends" ? W.friendsBody : W.asksBody}</Body>

      {now === "none" || now === "request_in" ? (
        <Button
          size="lg"
          className="mt-6"
          pending={ask.isPending}
          pendingLabel={W.sending}
          onClick={send}
        >
          {now === "none" ? W.send : PEOPLE_WORDS.accept}
        </Button>
      ) : (
        <p role="status" className="mt-6 text-base font-bold">
          {now === "friends" ? W.friends : W.sent}
        </p>
      )}

      {ask.error && !isStepRefusal(ask.error) ? (
        <Refusal error={ask.error} className="mt-4" />
      ) : null}

      {now === "friends" || now === "requested" ? (
        <ButtonLink href="/people" variant="outline" className="mt-6">
          {W.toPeople}
        </ButtonLink>
      ) : null}
    </>
  );
}

function Unavailable() {
  return (
    <Shell>
      <Title>{W.unavailable.title}</Title>
      <Body>{W.unavailable.body}</Body>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <Screen back={W.back}>{children}</Screen>;
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display tracking-display leading-display text-3xl text-balance">
      {children}
    </h1>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <p className="text-forest/70 text-body mt-3 text-pretty">{children}</p>
  );
}

function Loading() {
  return (
    <Shell>
      <LoadingState label={W.loading}>
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="mt-4 h-10 w-2/3" />
      </LoadingState>
    </Shell>
  );
}
