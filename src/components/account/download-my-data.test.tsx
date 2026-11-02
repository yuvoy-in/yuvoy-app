import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { EXPORT_WORDS } from "../../../mocks/export-handlers";
import { AccountScreen } from "./account-screen";
import { DOWNLOAD_NOTE, DownloadMyData, NO_SIGNAL } from "./download-my-data";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

/** What the browser was handed: the name and the text of each file. */
let saved: { name: string; href: string }[] = [];
let blobs: Blob[] = [];

beforeEach(() => {
  window.history.replaceState({}, "", "/account");
  __resetAppRouteMocks();
  __signInAppRouteMock();
  saved = [];
  blobs = [];
  // jsdom has no object URLs, and a real anchor click would try to navigate.
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:mock/${blobs.length}`;
    }),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, href: this.href });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const refusal = (code: string, message: string, status: number) =>
  server.use(
    http.get(`${BASE}/me/export`, () =>
      HttpResponse.json({ error: { code, message } }, { status }),
    ),
  );

describe("Download my data (yuvoy-app#221)", () => {
  it("says what the file is and the limit, tied to the button", () => {
    renderWithQuery(<DownloadMyData onSessionEnded={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Download my data" });
    expect(button).toHaveAccessibleDescription(DOWNLOAD_NOTE);
  });

  it("hands the browser the file under the API's name, and keeps nothing", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DownloadMyData onSessionEnded={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(/^yuvoy-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    const body = JSON.parse(await blobs[0]!.text()) as { generatedAt: string };
    expect(typeof body.generatedAt).toBe("string");
    // The link is gone from the page and its URL let go.
    expect(document.querySelector("a[download]")).toBeNull();
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(saved[0]!.href),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says it is working while the file is made", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get(`${BASE}/me/export`, async () => {
        await gate;
        return HttpResponse.json(
          { generatedAt: "2026-11-02T00:00:00Z", sections: {} },
          {
            headers: {
              "Content-Disposition":
                'attachment; filename="yuvoy-my-data-2026-11-02.json"',
            },
          },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<DownloadMyData onSessionEnded={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Download my data" });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByText("Making your file")).toBeInTheDocument();
    // A second tap while it works asks for nothing more.
    await user.click(button);
    release();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe("yuvoy-my-data-2026-11-02.json");
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  });

  it("shows the limit in the API's words, and stays ready", async () => {
    refusal("rate_limited", EXPORT_WORDS.limit, 429);
    const onSessionEnded = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<DownloadMyData onSessionEnded={onSessionEnded} />);
    const button = screen.getByRole("button", { name: "Download my data" });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      EXPORT_WORDS.limit,
    );
    expect(button).not.toHaveAttribute("aria-busy");
    expect(saved).toHaveLength(0);
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("offers a try again on 503, and the second tap makes the file", async () => {
    let asked = 0;
    server.use(
      http.get(
        `${BASE}/me/export`,
        () => {
          asked += 1;
          return HttpResponse.json(
            { error: { code: "unavailable", message: EXPORT_WORDS.down } },
            { status: 503 },
          );
        },
        { once: true },
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<DownloadMyData onSessionEnded={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Download my data" });

    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      EXPORT_WORDS.down,
    );
    expect(asked).toBe(1);

    await user.click(button);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says to check the signal when nothing answered", async () => {
    server.use(http.get("*/api/v1/me/export", () => HttpResponse.error()));
    const user = userEvent.setup();
    renderWithQuery(<DownloadMyData onSessionEnded={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(NO_SIGNAL);
  });

  it("hands a 401 up with the API's sentence", async () => {
    refusal("unauthorized", EXPORT_WORDS.signedOut, 401);
    const onSessionEnded = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<DownloadMyData onSessionEnded={onSessionEnded} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() =>
      expect(onSessionEnded).toHaveBeenCalledWith(EXPORT_WORDS.signedOut),
    );
    expect(saved).toHaveLength(0);
  });
});

describe("the row on Account", () => {
  it("is there when signed in", async () => {
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByRole("button", { name: "Download my data" }),
    ).toBeInTheDocument();
    expect(screen.getByText(DOWNLOAD_NOTE)).toBeInTheDocument();
  });

  it("is NOT there when signed out", async () => {
    __resetAppRouteMocks();
    renderWithQuery(<AccountScreen />);
    expect(
      await screen.findByLabelText("Your WhatsApp number"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download my data" }),
    ).toBeNull();
  });

  it("turns into the sign-in form on a 401, and says why", async () => {
    refusal("unauthorized", EXPORT_WORDS.signedOut, 401);
    const user = userEvent.setup();
    renderWithQuery(<AccountScreen />);
    await user.click(
      await screen.findByRole("button", { name: "Download my data" }),
    );

    expect(
      await screen.findByLabelText("Your WhatsApp number"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(EXPORT_WORDS.signedOut);
    expect(
      screen.queryByRole("button", { name: "Download my data" }),
    ).toBeNull();
  });
});
