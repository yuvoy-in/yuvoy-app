import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** Node-side MSW, used by Vitest. See vitest.setup.ts. */
export const server = setupServer(...handlers);
