"use client";

import { useState, type ReactNode } from "react";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import {
  isPeopleClosed,
  needsAge,
  needsName,
  usePeopleHome,
} from "@/lib/people/use-people";
import { PEOPLE_WORDS as W, type PeopleHome } from "@/lib/people/people-words";
import { isDeadToken } from "@/lib/api/errors";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { LoadingState, Skeleton } from "@/components/states";
import { AgeStep } from "./age-step";
import { NameStep } from "./name-step";
import { CrewsSection } from "./crews-section";
import { FriendLinkCard } from "./friend-link-card";
import { FriendsList, RequestsIn, RequestsOut } from "./people-lists";
import { EmailsSwitch, SharingFirst, SharingSetting } from "./people-settings";
import { UnderAgeClosed, refusalText } from "./people-parts";

/**
 * `/people`, the People screen (yuvoy-app#222, the web half of
 * yuvoy-mobile#366).
 *
 * In order: signed out asks to sign in and comes back; a `401` says the
 * sign-in expired; a `404` is the release closed ("not open yet", no list);
 * a standing of `restricted` or `removed` says so and shows nothing else;
 * then the age step, the name step and the first sharing choice, each until
 * it is answered; then requests in, requests sent, friends, crews
 * (yuvoy-app#227), the friend link and the two settings.
 *
 * A refusal anywhere below that asks for the age or the name
 * (`adult_confirmation_required`, `name_required`) opens that step here.
 *
 * An under-18 answer closes the account and signs out. Its sentence is held
 * in this component's state ABOVE the signed-in check, so the sign-out does
 * not replace it with the sign-in page.
 */
export function PeopleScreen() {
  const { signedIn, signOut, refresh } = useTravellerSession();
  const home = usePeopleHome(signedIn === true);
  const [closed, setClosed] = useState<string | null>(null);
  const [step, setStep] = useState<"age" | "name" | null>(null);

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
        <ButtonLink href="/account?next=/people" size="lg" className="mt-6">
          {W.signedOut.action}
        </ButtonLink>
      </Shell>
    );
  }

  if (home.isPending) return <Loading />;

  if (home.isLoadingError) {
    if (isDeadToken(home.error)) {
      return (
        <Shell>
          <Title>{W.sessionEnded.title}</Title>
          <Body>{W.sessionEnded.body}</Body>
          {/* The proxy has dropped the cookie: reading the session again
              turns this into the sign-in branch. */}
          <Button size="lg" className="mt-6" onClick={() => void refresh()}>
            {W.sessionEnded.action}
          </Button>
        </Shell>
      );
    }
    if (isPeopleClosed(home.error)) {
      return (
        <Shell>
          <Title>{W.closed.title}</Title>
          <Body>{W.closed.body}</Body>
        </Shell>
      );
    }
    if (needsAge(home.error) || needsName(home.error)) {
      return (
        <Shell>
          {needsAge(home.error) ? (
            <AgeStep
              onDone={() => void home.refetch()}
              onUnderAge={(message) => {
                setClosed(message);
                void signOut();
              }}
            />
          ) : (
            <NameStep onDone={() => void home.refetch()} />
          )}
        </Shell>
      );
    }
    return (
      <Shell>
        <div role="alert">
          <Title>{W.failed}</Title>
          <Body>{refusalText(home.error)}</Body>
        </div>
        <Button
          size="lg"
          className="mt-6"
          pending={home.isFetching}
          pendingLabel={W.retrying}
          onClick={() => void home.refetch()}
        >
          {W.retry}
        </Button>
      </Shell>
    );
  }

  const data = home.data;
  if (!data) return null;

  if (data.standing === "removed" || data.standing === "restricted") {
    return (
      <Shell>
        <Title>{W.title}</Title>
        <p role="status" className="text-body mt-3 text-pretty">
          {data.standing === "removed" ? W.ended : W.paused}
        </p>
      </Shell>
    );
  }

  const onStep = (error: unknown) => {
    if (needsAge(error)) setStep("age");
    else if (needsName(error)) setStep("name");
  };

  if (!data.ageConfirmed || step === "age") {
    return (
      <Shell>
        <AgeStep
          onDone={() => setStep(null)}
          onUnderAge={(message) => {
            setClosed(message);
            void signOut();
          }}
        />
      </Shell>
    );
  }

  if (data.needsName || step === "name") {
    return (
      <Shell>
        <NameStep onDone={() => setStep(null)} />
      </Shell>
    );
  }

  if (data.sharing === null) {
    return (
      <Shell>
        <SharingFirst home={data} onStep={onStep} />
      </Shell>
    );
  }

  return (
    <Shell>
      <PeopleHomeView home={data} onStep={onStep} />
    </Shell>
  );
}

function PeopleHomeView({
  home,
  onStep,
}: {
  home: PeopleHome;
  onStep: (error: unknown) => void;
}) {
  return (
    <>
      <Title>{W.title}</Title>
      <Body>{W.intro}</Body>
      {home.standing === "requests_paused" ? (
        <Panel tone="alert" role="status" className="mt-4 px-4 py-3">
          <p className="text-sm">{W.requestsPaused}</p>
        </Panel>
      ) : null}
      <RequestsIn requests={home.requestsIn} onStep={onStep} />
      <RequestsOut requests={home.requestsOut} />
      <FriendsList count={home.friendCount} />
      <CrewsSection friendCount={home.friendCount} />
      <FriendLinkCard link={home.friendLink} onStep={onStep} />
      <SharingSetting home={home} onStep={onStep} />
      <EmailsSwitch home={home} />
    </>
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
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-32 w-full" />
      </LoadingState>
    </Shell>
  );
}
