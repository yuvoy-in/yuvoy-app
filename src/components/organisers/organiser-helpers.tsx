"use client";

import { useState, type FormEvent } from "react";
import { Screen } from "@/components/chrome/screen";
import { LoadingState, Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { addHelpersOffLine, canAddHelpers } from "@/lib/organisers/organisers";
import {
  organiserRefusal,
  type OrganiserRefusal,
} from "@/lib/organisers/refusal";
import type { Organiser, OrganiserHelperListed } from "@/lib/organisers/types";
import {
  useAddOrganiserHelper,
  useOrganiser,
  useOrganiserHelpers,
  useRemoveOrganiserHelper,
} from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserRefusalBlock, OrganiserWriteError } from "./organiser-gate";
import {
  OrganiserHeading,
  OrganiserLoading,
  RefetchNotice,
  refusedAgain,
  backToOrganiser,
} from "./organiser-parts";

/**
 * `/organiser/{id}/helpers` (yuvoy-app#224, the phone's
 * `organiser-helpers.tsx`). An owner adds a helper by the email they sign in
 * with and removes one; "Add helper" is off until Yuvoy has checked the page,
 * with the sentence why. A helper who opens it reads first names only, with
 * nothing to add or remove. The API lists the helpers oldest added first and
 * never the owner.
 */
export function OrganiserHelpers({ id }: { id: string }) {
  const organiser = useOrganiser(id, true);
  const helpers = useOrganiserHelpers(id, true);
  const back = backToOrganiser(id);

  if (organiser.isPending) {
    return (
      <OrganiserLoading
        label={W.loadingHelpers}
        back={back}
        title={W.helpers}
      />
    );
  }

  if (organiser.data === undefined || refusedAgain(organiser)) {
    return (
      <Screen back={back}>
        <OrganiserHeading>{W.helpers}</OrganiserHeading>
        <OrganiserRefusalBlock
          refusal={organiserRefusal(organiser.error)}
          onRetry={() => void organiser.refetch()}
        />
      </Screen>
    );
  }

  const page = organiser.data;
  const owner = page.role === "owner";

  return (
    <Screen back={back}>
      <OrganiserHeading>{W.helpers}</OrganiserHeading>
      <p className="text-forest/75 mt-2 text-pretty break-words">{page.name}</p>
      <RefetchNotice query={organiser} />
      <p className="text-forest/75 mt-4 text-pretty">{W.helpersRead}</p>

      {owner ? <AddHelper organiser={page} /> : null}

      <section className="mt-8" aria-label={W.helpers}>
        {helpers.isPending ? (
          <LoadingState label={W.loadingHelpers}>
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </LoadingState>
        ) : helpers.data === undefined || refusedAgain(helpers) ? (
          <OrganiserRefusalBlock
            refusal={organiserRefusal(helpers.error)}
            onRetry={() => void helpers.refetch()}
          />
        ) : (
          <>
            <RefetchNotice query={helpers} />
            <HelperList organiser={page} items={helpers.data} />
          </>
        )}
      </section>
    </Screen>
  );
}

function AddHelper({ organiser }: { organiser: Organiser }) {
  const add = useAddOrganiserHelper(organiser.id);
  const open = canAddHelpers(organiser);
  const off = addHelpersOffLine(organiser.state);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<OrganiserRefusal | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const send = () => {
    if (!open || add.isPending) return;
    setRefusal(null);
    setAdded(null);
    const address = email.trim();
    if (address === "") {
      setError(W.needHelperEmail);
      return;
    }
    add.mutate(address, {
      onSuccess: (helper) => {
        setAdded(W.helperAdded(helper.firstName));
        setEmail("");
      },
      onError: (failure) => {
        const said = organiserRefusal(failure);
        if (said.kind === "fields") {
          setError(said.fields.email ?? said.message);
          return;
        }
        setRefusal(said);
      },
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mt-6"
      data-testid="organiser-helpers-form"
    >
      <Field
        label={W.helperEmail}
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(e) => {
          setEmail(e.currentTarget.value);
          setError(undefined);
          setAdded(null);
        }}
        error={error}
        disabled={!open}
        data-testid="organiser-helpers-email"
      />
      <Button
        type="submit"
        block
        className="mt-3"
        disabled={!open}
        pending={add.isPending}
        pendingLabel={W.adding}
        data-testid="organiser-helpers-add"
      >
        {W.addHelper}
      </Button>
      {open || !off ? null : (
        <p
          className="text-forest/75 mt-2 text-sm text-pretty"
          data-testid="organiser-helpers-off"
        >
          {off}
        </p>
      )}
      {added ? (
        <p
          role="status"
          className="text-forest/80 mt-2 text-sm"
          data-testid="organiser-helpers-added"
        >
          {added}
        </p>
      ) : null}
      <div className="mt-3">
        <OrganiserWriteError refusal={refusal} onRetry={send} />
      </div>
    </form>
  );
}

function HelperList({
  organiser,
  items,
}: {
  organiser: Organiser;
  items: readonly OrganiserHelperListed[];
}) {
  const remove = useRemoveOrganiserHelper(organiser.id);
  const owner = organiser.role === "owner";
  const [failed, setFailed] = useState<{
    travellerId: string;
    refusal: OrganiserRefusal;
  } | null>(null);

  const drop = (travellerId: string) => {
    if (remove.isPending) return;
    setFailed(null);
    remove.mutate(travellerId, {
      onError: (failure) => {
        const said = organiserRefusal(failure);
        // Already gone: the list is read again and says what is so now.
        if (said.kind !== "notFound") setFailed({ travellerId, refusal: said });
      },
    });
  };

  if (items.length === 0) {
    return (
      <p
        className="text-forest/75 text-pretty"
        data-testid="organiser-helpers-empty"
      >
        {W.noHelpers}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3" data-testid="organiser-helpers-list">
        {items.map((helper, i) => {
          const key = helper.travellerId ?? `helper-${i}`;
          const removing =
            remove.isPending && remove.variables === helper.travellerId;
          return (
            <li key={key}>
              <Panel
                tone="raised"
                className="flex min-w-0 items-center gap-3 px-4 py-3"
                data-testid="organiser-helper"
              >
                <span className="min-w-0 flex-1 break-words">
                  {W.helperName(helper.firstName)}
                </span>
                {owner && helper.travellerId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={W.removeHelperLabel(helper.firstName)}
                    pending={removing}
                    pendingLabel={W.removing}
                    onClick={() => drop(helper.travellerId ?? "")}
                  >
                    {W.removeHelper}
                  </Button>
                ) : null}
              </Panel>
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <OrganiserWriteError
          refusal={failed?.refusal ?? null}
          onRetry={() => {
            if (failed) drop(failed.travellerId);
          }}
        />
      </div>
    </>
  );
}
