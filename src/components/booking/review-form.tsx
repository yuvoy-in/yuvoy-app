"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { describeError } from "@/components/states";
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
export function ReviewForm({ token }: { token: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const submit = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      const { error } = await client.POST("/bookings/review", {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      if (error) throw error;
    },
  });

  if (submit.isSuccess) {
    return (
      <div className="rounded-edge border-cream-line bg-cream-deep mt-8 border p-5">
        <p className="text-sm font-bold">Thank you</p>
        <p className="text-forest/70 mt-1.5 text-sm">
          That is recorded. Reviews cannot be changed once left, so this one
          stands as written.
        </p>
      </div>
    );
  }

  const failure = submit.error ? describeError(submit.error) : null;

  return (
    <form
      className="rounded-edge border-cream-line bg-cream-deep mt-8 border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating > 0) submit.mutate();
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
                "rounded-edge size-12 border text-lg",
                rating >= n
                  ? "border-terra-deep bg-terra-deep text-cream"
                  : "border-cream-line",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="label text-forest/75">
          Anything you would tell a friend (optional)
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="rounded-edge border-cream-line bg-cream focus:border-terra-deep mt-2 w-full border px-3.5 py-2.5 text-base outline-none"
        />
      </label>

      {/* Said BEFORE submitting, not discovered after. */}
      <p className="text-forest/70 mt-3 text-xs">
        Once you leave a review it cannot be edited or removed.
      </p>

      <button
        type="submit"
        disabled={rating === 0 || submit.isPending}
        className="rounded-edge label bg-forest text-cream mt-4 h-11 w-full font-bold disabled:opacity-40"
      >
        {submit.isPending ? "Sending…" : "Leave this review"}
      </button>

      {failure ? (
        <p role="alert" className="text-forest/70 mt-3 text-sm">
          {failure.body}
        </p>
      ) : null}
    </form>
  );
}
