/**
 * One JSON-LD block.
 *
 * A component rather than a repeated `dangerouslySetInnerHTML`, so the
 * serialisation and the escaping happen once. Every node passed in comes from
 * an allowlisted builder in lib/site/structured-data.ts, which throws on a
 * rating, a review count, a price or an availability claim.
 */
export function JsonLd({ node }: { node: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // `</script>` inside a string value would close this tag early. It has
      // never happened here and it is one replace to make sure it cannot.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(node).replace(/</g, "\\u003c"),
      }}
    />
  );
}
