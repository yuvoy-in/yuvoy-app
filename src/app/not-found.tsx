import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-abyss flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-display tracking-display text-cream text-3xl leading-tight">
        We do not have this one
      </p>
      <p className="text-cream/70 mt-3 max-w-sm text-sm">
        It may have been taken off sale, or the link may be wrong.
      </p>
      <Link
        href="/"
        className="rounded-edge label bg-cream text-forest mt-6 flex h-11 items-center px-6 font-bold"
      >
        Back to the feed
      </Link>
    </div>
  );
}
