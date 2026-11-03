"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ME_WORDS } from "@/lib/me/words";
import { useAnswerDidYouGo } from "@/lib/me/use-life-list";
import type { DidYouGoItem } from "@/lib/me/types";

/**
 * "Did you go to {title}?" for each event that ended without a check-in
 * (yuvoy-mobile#444), above the life list. Yes adds it to Done as "You said
 * you went"; No only stops the asking.
 *
 * The question leaves at the tap (the hook takes it out of the list before
 * the answer lands), so a second tap has nothing to land on. One that did not
 * go through comes back, with the line that says so, to be answered again.
 */
export function DidYouGo({ items }: { items: readonly DidYouGoItem[] }) {
  const ids = useId();
  const answer = useAnswerDidYouGo();
  const [failed, setFailed] = useState<string | null>(null);
  if (items.length === 0) return null;

  const reply = (eventId: string, went: boolean) => {
    setFailed(null);
    answer.mutate({ eventId, went }, { onError: () => setFailed(eventId) });
  };

  return (
    <section aria-labelledby={`${ids}-head`} className="space-y-3">
      <h2 id={`${ids}-head`} className="label text-forest/75">
        {ME_WORDS.didYouGoHead}
      </h2>
      {items.map((item) => (
        <Question
          key={item.eventId}
          item={item}
          failed={failed === item.eventId}
          onAnswer={(went) => reply(item.eventId, went)}
        />
      ))}
    </section>
  );
}

function Question({
  item,
  failed,
  onAnswer,
}: {
  item: DidYouGoItem;
  failed: boolean;
  onAnswer: (went: boolean) => void;
}) {
  const ids = useId();
  const questionId = `${ids}-question`;
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      className="border-paper-line bg-paper-deep rounded-card border p-4"
    >
      <p id={questionId} className="text-body font-bold text-pretty">
        {ME_WORDS.didYouGo(item.title)}
      </p>
      <div className="mt-3 flex gap-2">
        {/* Each names the event it answers for, as the phone's do. */}
        <Button
          size="sm"
          aria-label={ME_WORDS.yesLabel(item.title)}
          onClick={() => onAnswer(true)}
        >
          {ME_WORDS.yes}
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={ME_WORDS.noLabel(item.title)}
          onClick={() => onAnswer(false)}
        >
          {ME_WORDS.no}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-terra-deep mt-2 text-xs">
          {ME_WORDS.changeFailed}
        </p>
      ) : null}
    </div>
  );
}
