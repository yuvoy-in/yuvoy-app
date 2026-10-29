"use client";

import { useState } from "react";
import { YuvoyError } from "@/lib/api/errors";
import { useServerClock } from "@/lib/booking/use-server-clock";
import { useWithdrawTableSeat, type TableView } from "@/lib/tables/use-table";
import { TABLE_WORDS } from "@/lib/tables/table-words";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPresence } from "@/components/ui/sheet";

const W = TABLE_WORDS.withdraw;

/**
 * Withdrawing a request, or giving back a seat (yuvoy-app#194).
 *
 * Offered only while it can work: a request that is waiting or approved, on a
 * table that is listed or in review, before the start. The server says the
 * same (`409 table_closed` once it has started or was cancelled), so this is
 * about not offering a button that can only be refused. "Before the start" is
 * read on the server's clock, which a phone that is ten minutes off cannot
 * move.
 *
 * One confirm step, because nothing here undoes it: a seat given back goes to
 * somebody else, and asking again is not on this page. The `200` replaces the
 * table on screen. A refusal closes the sheet and the table is read again;
 * `table_closed` also says why here, under where the button was.
 */
export function WithdrawSeat({
  id,
  table,
  readAt,
}: {
  id: string;
  table: TableView;
  /** When the table was read, on the server's clock. */
  readAt: number;
}) {
  const withdraw = useWithdrawTableSeat(id);
  const [confirming, setConfirming] = useState(false);
  /*
    Which one was asked, kept while the sheet leaves: by then the answer has
    replaced the table and the request reads withdrawn.
  */
  const [asked, setAsked] = useState<"requested" | "approved">("requested");
  const now = useServerClock(readAt);

  const state = table.myRequest?.state;
  const live = state === "requested" || state === "approved";
  const open = table.status === "listed" || table.status === "in_review";
  const offered = live && open && now < Date.parse(table.startsAt);

  const closed =
    withdraw.error instanceof YuvoyError &&
    withdraw.error.code === "table_closed";

  return (
    <>
      {offered || closed ? (
        <div className="mt-8">
          {offered ? (
            <>
              {state === "approved" ? (
                <p className="text-body mb-3 text-pretty">{W.canNotMake}</p>
              ) : null}
              <Button
                variant="outline"
                block
                disabled={withdraw.isPending}
                onClick={() => {
                  withdraw.reset();
                  setAsked(state === "approved" ? "approved" : "requested");
                  setConfirming(true);
                }}
              >
                {state === "approved" ? W.approved : W.requested}
              </Button>
            </>
          ) : null}

          {closed ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              {W.closed}
            </p>
          ) : null}
        </div>
      ) : null}

      <SheetPresence open={confirming}>
        <Sheet
          open
          onClose={() => setConfirming(false)}
          title={asked === "approved" ? W.approved : W.requested}
          footer={
            <div className="flex gap-3">
              <Button
                variant="outline"
                block
                onClick={() => setConfirming(false)}
              >
                {W.keep}
              </Button>
              <Button
                block
                pending={withdraw.isPending}
                pendingLabel={W.confirming}
                onClick={() =>
                  withdraw.mutate(undefined, {
                    onSuccess: () => setConfirming(false),
                    onError: (error) => {
                      /*
                        Closed or gone: the sheet goes and the page shows what
                        the table now says. Anything else stays in the sheet
                        with its sentence, to try again from there.
                      */
                      if (
                        error instanceof YuvoyError &&
                        (error.status === 404 ||
                          error.status === 409 ||
                          error.status === 401)
                      ) {
                        setConfirming(false);
                      }
                    },
                  })
                }
              >
                {W.confirm}
              </Button>
            </div>
          }
        >
          <p className="text-body text-pretty">
            {asked === "approved" ? W.approvedBody : W.requestedBody}
          </p>
          {withdraw.error && !closed ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              {withdraw.error instanceof YuvoyError
                ? withdraw.error.message
                : W.failed}
            </p>
          ) : null}
        </Sheet>
      </SheetPresence>
    </>
  );
}
