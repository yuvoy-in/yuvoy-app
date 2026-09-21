"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { FAQ, searchFaq } from "@/lib/support/faq";
import { Screen } from "@/components/chrome/screen";
import { Panel } from "@/components/ui/panel";
import { Field } from "@/components/ui/field";
import { SearchIcon } from "@/components/ui/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { MessageSheet } from "./message-sheet";
import { cn } from "@/lib/cn";

const BACK = { href: "/account", label: "your account" };

/**
 * The Help Center.
 *
 * ## Why it is a destination
 *
 * Help used to be a panel stapled to the bottom of the booking page and to
 * Account: a heading, two buttons and nothing to read. So the only way to
 * answer "what happens if I cancel" was to message a person and wait, for a
 * question the product could have answered instantly.
 *
 * ## Mechanics, never policy
 *
 * Every answer here describes how the product behaves. None states a refund
 * percentage, a window or a fee, and that is correctness rather than caution:
 * a cancellation policy is frozen onto each booking at checkout, so there is
 * no single policy to state. `getCancellationQuote` prices the real refund on
 * the real booking before anybody confirms. See `lib/support/faq`.
 *
 * ## What it does not claim
 *
 * There is no ticket list, because there is no endpoint behind one. `POST
 * /support/requests` is the whole support surface: it takes a message and
 * answers a reference, and a person replies on WhatsApp. Inventing a status
 * screen over that would be a lie with a progress bar on it. yuvoy-api#196 is
 * the gap, filed rather than papered over.
 */
export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  /*
    Account is read for the support number only, and its absence is not an
    error: this page is useful signed out, and every answer on it is static.
    A failure here costs the WhatsApp button and nothing else.
  */
  const me = useQuery({
    queryKey: ["me", "support"],
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me", { signal });
      if (error) throw error;
      return data;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  /*
    An ERROR here is indistinguishable from "no number is configured", and both
    mean exactly the same thing to a traveller: no WhatsApp button, and the
    form still works. Named rather than left implicit, so the next reader can
    see it was decided and not forgotten. Every answer on this page is static,
    so a failed `/me` must never take the page down with it.
  */
  const number = me.data?.support?.whatsappE164?.trim();
  const digits = number ? number.replace(/\D+/g, "") : "";
  const waHref = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent("Hi, I need help with Yuvoy.")}`
    : null;

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchFaq(query), [query]);

  return (
    <Screen back={BACK} stageLabel="Help" width="lg">
      <h1 className="font-display tracking-display text-3xl leading-tight sm:text-4xl">
        Help
      </h1>
      <p className="text-forest/70 mt-3 max-w-prose text-sm">
        How booking, paying and cancelling work on Yuvoy. If the answer is not
        here, a person will help.
      </p>

      <Field
        label="Search help"
        labelHidden
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help"
        leading={<SearchIcon className="size-4" />}
        className="mt-8"
      />

      {searching ? (
        <SearchResults query={query} results={results} />
      ) : (
        <div className="mt-8 space-y-10">
          {FAQ.map((category) => (
            <section key={category.key} aria-labelledby={`faq-${category.key}`}>
              <h2
                id={`faq-${category.key}`}
                className="label text-forest/75 border-paper-line border-b pb-2"
              >
                {category.label}
              </h2>
              <div className="mt-1">
                {category.items.map((item) => (
                  <Answer
                    key={item.id}
                    id={item.id}
                    question={item.question}
                    answer={item.answer}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/*
        The people, under the answers rather than above them.

        Somebody who scrolled past twenty answers without finding theirs is
        exactly who should be offered a person, and putting the buttons first
        would make the page a contact form with reading material attached.
      */}
      <section aria-labelledby="contact" className="mt-14">
        <h2 id="contact" className="label text-forest/75">
          Still stuck?
        </h2>
        <Panel className="mt-3">
          {me.isPending ? (
            /*
              A held space, not a skeleton. This is one button that may be
              about to not exist, and a shimmer would draw the eye to it; the
              space stops the form below jumping when the answer lands. Same
              reasoning `LoginButton` records for the same problem.
            */
            <div aria-hidden="true" className="h-11" />
          ) : me.isError || !waHref ? null : (
            <>
              {/*
                `rel="noopener"` because `target="_blank"` otherwise hands the
                opened page a live `window.opener` back to this one.
              */}
              <ButtonLink
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                block
              >
                Chat with us
              </ButtonLink>
              {me.data?.support?.hours ? (
                <p className="text-forest/70 mt-2 text-xs">
                  {me.data.support.hours}
                </p>
              ) : null}
            </>
          )}

          <Button
            variant="outline"
            block
            onClick={() => setOpen(true)}
            className={me.isPending || waHref ? "mt-3" : undefined}
          >
            Send us a message
          </Button>

          {/*
            Said before they write, not only after they send. Somebody who
            expects a ticket queue writes a different message from somebody who
            knows a person answers on WhatsApp.
          */}
          <p className="text-forest/70 mt-3 text-xs">
            A person replies on WhatsApp, to the number you booked with.
          </p>
        </Panel>
      </section>

      {open ? <MessageSheet onClose={() => setOpen(false)} /> : null}
    </Screen>
  );
}

/** What the query found, or an honest nothing with a way onward. */
function SearchResults({
  query,
  results,
}: {
  query: string;
  results: ReturnType<typeof searchFaq>;
}) {
  if (results.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-sm font-bold">Nothing matches “{query}”</p>
        <p className="text-forest/70 mt-2 max-w-prose text-sm">
          Try a different word, or send us a message below and somebody will
          answer.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <p className="text-forest/70 text-xs" role="status">
        {results.length} {results.length === 1 ? "answer" : "answers"}
      </p>
      <div className="mt-2">
        {results.map((item) => (
          <Answer
            key={item.id}
            id={item.id}
            question={item.question}
            answer={item.answer}
            meta={item.category}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One question, opening in place.
 *
 * `<details>` rather than a button and a state hook: it opens with no
 * JavaScript, it is findable by the browser's own in-page search even while
 * shut, and a screen reader announces it as expandable without any ARIA to get
 * wrong. The only thing added is the marker, which is removed so the chevron
 * can sit on the right where the rest of this product puts it.
 */
function Answer({
  id,
  question,
  answer,
  meta,
}: {
  id: string;
  question: string;
  answer: string[];
  meta?: string;
}) {
  return (
    <details id={id} className="border-paper-line group border-b">
      <summary
        className={cn(
          "tap-target flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-bold",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <span>
          {question}
          {meta ? (
            <span className="text-forest/70 block text-xs font-normal">
              {meta}
            </span>
          ) : null}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className="text-forest/70 size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pb-4">
        {answer.map((paragraph, i) => (
          <p key={i} className="text-forest/80 mt-2 max-w-prose text-sm">
            {paragraph}
          </p>
        ))}
      </div>
    </details>
  );
}
