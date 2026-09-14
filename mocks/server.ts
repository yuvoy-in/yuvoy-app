import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { appRouteHandlers } from "./app-route-handlers";

/**
 * Node-side MSW, used by Vitest and by the Next server. See vitest.setup.ts.
 *
 * `appRouteHandlers` stands in for this app's OWN route handlers, which need a
 * Next server to run and therefore do not exist under jsdom. They are here and
 * not in `handlers` on purpose: the browser worker must NOT have them, so that
 * `pnpm dev` and e2e exercise the real routes and the real cookie. Inside the
 * Next server they are inert, because nothing on the server fetches the
 * server's own routes. See app-route-handlers.ts.
 */
export const server = setupServer(...handlers, ...appRouteHandlers);
