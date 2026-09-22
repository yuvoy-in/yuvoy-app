import { useSyncExternalStore } from "react";

/**
 * True once this tree has hydrated; false on the server AND during the
 * hydration render itself.
 *
 * `useSyncExternalStore` is the honest way to ask. While hydrating, React
 * renders with the server snapshot (`false`), so a component's first client
 * render matches the server HTML whatever the browser already knows; straight
 * after, it re-renders with the client snapshot (`true`). A `typeof window`
 * check would mismatch, and an effect-driven flag says the same thing one
 * render later.
 *
 * ## Why it is shared
 *
 * Any component whose first render reads client state can disagree with the
 * server, and the obvious case is not the only one. The one that made this a
 * shared hook: `LoginButton` sits in its own Suspense boundary, so it hydrates
 * AFTER the feed. Once every feed card read the session (for saves, which
 * live on the account when signed in), the cards' `/api/session` request could
 * answer before that boundary hydrated. The button's first client render then
 * drew "Login" over a server placeholder, and WebKit threw React #418 on the
 * feed and on every shared reel. The React Query cache is not per render: a
 * sibling that hydrates first can fill it for everybody after.
 *
 * Nothing in the store is ever written, so `subscribe` never calls back. It is
 * hoisted so React does not resubscribe on every render.
 */
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
