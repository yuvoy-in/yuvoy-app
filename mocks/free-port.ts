import { execFileSync } from "node:child_process";

/**
 * Tries each port in turn at 127.0.0.1 and with no host, the call the e2e web
 * server makes, and prints the first one where both listen. Exits 1 when none
 * does.
 */
const PROBE = `
const net = require("node:net");
const [from, to] = process.argv.slice(1).map(Number);
function listens(port, host, then, otherwise) {
  const server = net.createServer();
  server.once("error", otherwise);
  server.listen(port, host, () => server.close(then));
}
(function attempt(port) {
  if (port > to) process.exit(1);
  const next = () => attempt(port + 1);
  listens(port, "127.0.0.1", () => {
    listens(port, undefined, () => process.stdout.write(String(port)), next);
  }, next);
})(from);
`;

/**
 * The first port from `from` to `to` that a server may listen on, at
 * 127.0.0.1 and with no host.
 *
 * Both, because neither answer covers the other: on macOS 127.0.0.1 binds
 * happily beside a server already listening on every address, and that server
 * then answers the loopback requests.
 *
 * For `playwright.config.ts`, which is evaluated synchronously. Node has no
 * synchronous `listen`, so the asking happens in a child process.
 *
 * Free at this instant, which is all a probe can say. If something takes the
 * port before the server does, the server fails to start and says so.
 */
export function firstFreeLoopbackPort(from: number, to: number): number {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    from > to ||
    to > 65_535
  ) {
    throw new RangeError(`Not a port range: ${from} to ${to}.`);
  }
  let answer: string;
  try {
    answer = execFileSync(
      process.execPath,
      ["-e", PROBE, String(from), String(to)],
      { encoding: "utf8", timeout: 10_000 },
    );
  } catch {
    throw new Error(`No port from ${from} to ${to} is free on 127.0.0.1.`);
  }
  const port = Number(answer);
  if (!Number.isInteger(port) || port < from || port > to) {
    throw new Error(
      `The free port probe answered "${answer}", which is not a port from ${from} to ${to}.`,
    );
  }
  return port;
}
