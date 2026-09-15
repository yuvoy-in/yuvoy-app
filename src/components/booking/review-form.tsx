"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { describeError, FailurePanel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StarIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/**
 * A post-trip review.
 *
 * Only reachable once a trip has actually completed, so there is no "reviews
 * from people who never came" problem to design around.
 *
 * A review CANNOT be edited once left — enforced by a database trigger, not a
 * UI rule. That is said before submitting rather than discovered afterwards: a
 * disabled edit button with no explanation is worse than the constraint.
 *
 * The comment is optional. Plenty of people tap five stars and nothing else,
 * and a required comment box turns a two-second act into an abandoned one.
 */
/**
 * What was good, from the server's closed list (#38 item 3).
 *
 * The KEYS are the contract's and the words are ours: the enum is
 * `guide, safety, value, organisation, punctuality, equipment`, and "A value
 * outside the list, or more than six entries, is refused with
 * `invalid_input`". Written out here rather than derived from anything,
 * because a tag the API does not know is a submission that fails after the
 * traveller has chosen it.
 *
 * Order is the order they are offered. The contract keeps the order it is
 * sent, so this is also the order they are stored in.
 */
const TAGS = [
  { key: "guide", label: "The guide" },
  { key: "safety", label: "Safety" },
  { key: "value", label: "Value for money" },
  { key: "organisation", label: "Organisation" },
  { key: "punctuality", label: "On time" },
  { key: "equipment", label: "Equipment" },
] as const;

type TagKey = (typeof TAGS)[number]["key"];

export function ReviewForm({ token }: { token: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<TagKey[]>([]);

  /**
   * The same synchronous guard checkout uses. `isPending` is React state and
   * two taps 40 ms apart both read the old value — the second POST answered
   * 409 (one review per booking) and, because a second `mutate` resets the
   * mutation, REPLACED the recorded review on screen with a generic failure.
   * A ref flips in the same tick.
   */
  const submitting = useRef(false);

  const submit = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { error } = await client.POST("/bookings/review", {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          /*
            Omitted entirely when nothing is chosen, rather than sent as `[]`.
            The field is optional and an empty array is a different statement
            from an absent one: "I picked nothing" rather than "I did not
            answer". Nothing downstream distinguishes them today, and the
            absent form is the one that stays correct if something ever does.
          */
          ...(tags.length ? { tags } : {}),
        },
      });
      if (error) throw error;
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  /*
    A review already exists for this booking. That is the recorded state, not
    a failure to render as one.

    Two codes, and both are load-bearing. The API answered `conflict` until
    2026-09-13 and answers `already_reviewed` since (yuvoy-app#53). `conflict`
    is kept because the code the app reads is decided by the DEPLOYED API, not
    by the pinned document: a deployment behind the split still answers the
    old one, and dropping it would put this branch back out of reach.

    The other two codes of that split are NOT "already recorded" and must not
    land here. `not_reviewable_yet` means the trip has not been marked done,
    and `review_window_closed` means 30 days have passed. Both fall through to
    the failure panel, which has a sentence for each.
  */
  const alreadyRecorded =
    submit.error instanceof YuvoyError &&
    (submit.error.code === "already_reviewed" ||
      submit.error.code === "conflict");

  /*
    The other two codes of the 2026-09-13 split. Neither is "already
    recorded" and neither can be retried: the trip has not been marked done,
    or 30 days have passed.

    They take the form off the screen rather than sitting under it, because
    the whole point of #53 was a button that could never succeed. Leaving an
    enabled "Leave this review" beneath "Too late to review this one" would
    rebuild the same trap with better copy on top of it.
  */
  const reviewClosed =
    submit.error instanceof YuvoyError &&
    (submit.error.code === "not_reviewable_yet" ||
      submit.error.code === "review_window_closed");

  if (reviewClosed) {
    return (
      <FailurePanel
        failure={describeError(submit.error, { tokenBearing: true })}
        className="mt-8"
      />
    );
  }

  if (submit.isSuccess || alreadyRecorded) {
    return (
      <Panel className="mt-8">
        <p className="text-sm font-bold">
          {alreadyRecorded ? "Already recorded" : "Thank you"}
        </p>
        <p className="text-forest/70 mt-1.5 text-sm">
          {alreadyRecorded
            ? "A review for this trip is already on record. Reviews cannot be changed once left, so it stands as written."
            : "That is recorded. Reviews cannot be changed once left, so this one stands as written."}
        </p>
      </Panel>
    );
  }

  const failure = submit.error
    ? describeError(submit.error, { tokenBearing: true })
    : null;

  return (
    <Panel className="mt-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (rating === 0 || submitting.current) return;
          submitting.current = true;
          submit.mutate();
        }}
      >
        <h2 className="text-sm font-bold">How was it?</h2>

        <fieldset className="mt-4">
          <legend className="sr-only">Rating out of five</legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} out of 5`}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
                className={cn(
                  "ease-interaction inline-flex size-11 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.96]",
                  rating >= n
                    ? "border-forest bg-forest text-cream"
                    : "border-cream-line bg-cream text-forest/70 hover:border-forest/40",
                )}
              >
                <StarIcon filled={rating >= n} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>

        {/*
          Choose any, including none. A group of toggles rather than a
          multi-select: six options is few enough to show at once, and a select
          on a phone is a modal over a form the traveller is already in.
        */}
        <fieldset className="mt-5">
          <legend className="label text-forest/75">What was good?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAGS.map((tag) => {
              const on = tags.includes(tag.key);
              return (
                <button
                  key={tag.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTags((chosen) =>
                      chosen.includes(tag.key)
                        ? chosen.filter((k) => k !== tag.key)
                        : [...chosen, tag.key],
                    )
                  }
                  className={cn(
                    "rounded-control ease-interaction tap-target border px-3 py-2 text-sm transition-colors duration-200",
                    on
                      ? "border-forest bg-forest text-cream"
                      : "border-cream-line bg-cream text-forest hover:border-forest/40",
                  )}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="label text-forest/75">
            Anything else? (optional)
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            /* The contract's own bound. Refused with `invalid_input` past it,
               so the field stops rather than the submission failing. */
            maxLength={2000}
            className="rounded-control border-cream-line bg-cream focus:border-forest/60 ease-interaction mt-2 w-full border px-4 py-3 text-base transition-colors duration-200 outline-none"
          />
        </label>

        {/* Said BEFORE submitting, not discovered after. */}
        <p className="text-forest/70 mt-3 text-xs">
          Once you leave a review it cannot be edited or removed.
        </p>

        <Button
          type="submit"
          block
          disabled={rating === 0 || submit.isPending}
          className="mt-4"
        >
          {submit.isPending ? "Sending…" : "Leave this review"}
        </Button>

        {failure ? <FailurePanel failure={failure} className="mt-3" /> : null}
      </form>
    </Panel>
  );
}
