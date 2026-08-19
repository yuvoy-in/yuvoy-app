import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Browser-side MSW, started only in development. See MswProvider. */
export const worker = setupWorker(...handlers);
