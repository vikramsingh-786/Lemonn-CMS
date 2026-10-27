import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/features/dashboard/dashboard";
import { stepStates } from "@/features/dashboard/research-panel";
import type { CandidateReport, ResearchDraft, ResearchRun } from "@/features/research/types";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const respond = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const candidate = (overrides: Partial<CandidateReport>): CandidateReport => ({
  id: "C1",
  rank: 1,
  headline: "Banks rally on rate hopes",
  url: "https://www.livemint.com/a",
  publisher: "Mint Markets",
  publishedAt: "2026-10-27T10:00:00Z",
  otherReports: [],
  status: "verified",
  statusReason: "All 1 material claim(s) supported by traceable evidence.",
  primaryEvidenceFound: true,
  claims: [],
  claimCounts: { supported: 1, partially_supported: 0, contradicted: 0, unresolved: 0 },
  evidence: [],
  evidenceSearchFailures: 0,
  draftId: "r1-C1",
  ...overrides,
});

const draft: ResearchDraft = {
  id: "r1-C1",
  candidateId: "C1",
  headline: "Banks lead Sensex gains",
  summary: "Bank stocks led gains, an NSE notice shows.",
  body: "Body text.",
  seoTitle: "Bank stocks lift Sensex | Lemonn",
  seoDescription: "Bank stocks led gains.",
  originalUrl: "https://www.livemint.com/a",
  publisher: "Mint Markets",
  sourcePublishedAt: "2026-10-27T10:00:00Z",
  officialEvidenceUrls: ["https://www.nseindia.com/notice"],
  secondaryEvidenceUrls: [],
  verificationStatus: "verified",
  claimEvidence: [{ claim: "Banks rallied", evidenceUrls: ["https://www.nseindia.com/notice"] }],
  readiness: "ready_for_review",
  readinessReason: "Every figure traces to verified evidence. Ready for editorial review.",
  researchedAt: "2026-10-27T12:00:00Z",
};

function run(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    runId: "r1",
    window: { start: "2026-10-26T12:00:00Z", end: "2026-10-27T12:00:00Z" },
    stage: "completed",
    currentStep: null,
    stageDetail: "1 verified draft(s) from 2 processed stories.",
    startedAt: "2026-10-27T12:00:00Z",
    finishedAt: "2026-10-27T12:01:00Z",
    draftTarget: 10,
    coverage: [
      {
        sourceId: "mint-markets",
        name: "Mint Markets",
        domain: "livemint.com",
        status: "ok",
        resultCount: 5,
        eligibleCount: 4,
      },
      {
        sourceId: "nse",
        name: "NSE India",
        domain: "nseindia.com",
        status: "failed",
        resultCount: 0,
        eligibleCount: 0,
        message: "Tavily did not respond in time.",
      },
    ],
    counts: {
      resultsFound: 5,
      excludedUndated: 1,
      excludedStale: 0,
      duplicatesRemoved: 1,
      uniqueCandidates: 2,
      processed: 2,
      verified: 1,
      held: 1,
      drafts: 1,
      notProcessed: 0,
      searchesUsed: 6,
      aiCallsUsed: 3,
    },
    candidates: [
      candidate({}),
      candidate({
        id: "C2",
        rank: 2,
        headline: "Jio plans IPO",
        status: "partially_verified",
        draftId: null,
        statusReason: "0 of 1 material claim(s) fully supported; the rest lack adequate evidence.",
        primaryEvidenceFound: false,
      }),
    ],
    drafts: [draft],
    warnings: [],
    errorCounts: { "tavily:timeout": 1 },
    timings: [{ stage: "discovery", ms: 3200 }],
    shortfallReasons: [
      "Only 2 unique stories from the last 24 hours were found across 1 enabled source(s).",
    ],
    error: null,
    ...overrides,
  };
}

/** Routes fetch by URL/method. `polls` are returned in order for GET /api/research/r1. */
function server({
  start = respond({ runId: "r1" }, 202),
  polls = [run()],
}: { start?: Response; polls?: ResearchRun[] } = {}) {
  let poll = 0;
  fetchMock.mockImplementation(async (url, init) => {
    const u = String(url);
    if (u === "/api/sources") return respond({ sources: [] }, 500); // keep local defaults
    if (u === "/api/research" && init?.method === "POST") return start;
    if (u.startsWith("/api/research/")) return respond(polls[Math.min(poll++, polls.length - 1)]);
    if (init?.method === "DELETE") return respond(null, 204);
    return respond({}, 404);
  });
}

const researchButton = () => screen.getByRole("button", { name: /Research News|Researching/ });
const researchCalls = () =>
  fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/research"));

describe("Dashboard research flow", () => {
  it("shows live stage progress while polling, then results", async () => {
    server({
      polls: [
        run({
          stage: "processing",
          stageDetail: "Processing story 1 of 2 · 0 draft(s) so far",
          drafts: [],
        }),
        run(),
      ],
    });
    render(<Dashboard />);
    fireEvent.click(researchButton());
    expect(researchButton()).toBeDisabled();
    expect(
      await screen.findByText(/Research run · Verifying and drafting/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    fireEvent.click(researchButton()); // ignored while running
    expect(researchCalls().filter(([, i]) => i?.method === "POST")).toHaveLength(1);
    expect(
      await screen.findByText("Banks lead Sensex gains", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Research completed: 1 verified draft/)).toBeInTheDocument();
  });

  it("sends only source ids and enabled flags", async () => {
    server();
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("switch", { name: "Use NSE India for research" }));
    fireEvent.click(researchButton());
    const [, init] = researchCalls().find(([, i]) => i?.method === "POST")!;
    const body = JSON.parse(String(init!.body));
    expect(body.sources.find((s: { id: string }) => s.id === "nse")).toEqual({
      id: "nse",
      enabled: true,
    });
    expect(JSON.stringify(body)).not.toContain("http");
  });

  it("shows verified drafts with evidence, held stories with reasons, coverage and shortfall", async () => {
    server();
    render(<Dashboard />);
    fireEvent.click(researchButton());
    const card = (
      await screen.findByText("Banks lead Sensex gains", {}, { timeout: 4000 })
    ).closest("li")!;
    expect(within(card).getByText("Verified")).toBeInTheDocument();
    expect(within(card).getByText("Awaiting editorial review")).toBeInTheDocument();
    expect(within(card).getAllByRole("link", { name: /nseindia\.com\/notice/ })[0]).toHaveAttribute(
      "href",
      "https://www.nseindia.com/notice",
    );
    const verification = screen.getByRole("region", { name: "Verification" });
    expect(within(verification).getByText("Jio plans IPO")).toBeInTheDocument();
    expect(within(verification).getByText("Partially verified")).toBeInTheDocument();
    expect(within(verification).getByText(/rest lack adequate evidence/)).toBeInTheDocument();
    // The sidebar feed lists the same stories and links to their details.
    const feed = screen.getByRole("region", { name: "Live Research Feed" });
    expect(within(feed).getByRole("link", { name: /Jio plans IPO/ })).toHaveAttribute(
      "href",
      "#verification",
    );
    expect(within(feed).getByRole("link", { name: /Banks rally on rate hopes/ })).toHaveAttribute(
      "href",
      "#articles",
    );
    expect(screen.getByText(/Why fewer than 10 verified drafts/)).toBeInTheDocument();
    expect(screen.getByText("Tavily did not respond in time.")).toBeInTheDocument();
    expect(screen.getByText(/1 Tavily timeouts/)).toBeInTheDocument();
  });

  it("shows an empty state when nothing passed verification", async () => {
    server({ polls: [run({ drafts: [], counts: { ...run().counts, drafts: 0 } })] });
    render(<Dashboard />);
    fireEvent.click(researchButton());
    expect(
      await screen.findByText("No verified drafts", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("shows start errors safely and allows retry", async () => {
    server({
      start: respond(
        {
          error: {
            code: "not_configured",
            message:
              "Research is not configured. Set TAVILY_API_KEY in .env and restart the server.",
            retryable: false,
          },
        },
        503,
      ),
    });
    render(<Dashboard />);
    fireEvent.click(researchButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Research is not configured");
    server();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Banks lead Sensex gains", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("shows a failed run's message", async () => {
    server({
      polls: [
        run({
          stage: "failed",
          error: {
            code: "provider_auth",
            message: "Tavily rejected the API key. Check TAVILY_API_KEY.",
          },
        }),
      ],
    });
    render(<Dashboard />);
    fireEvent.click(researchButton());
    expect(
      await screen.findByText(/Tavily rejected the API key/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("keeps Publish as a mock: opens a dialog and makes no request", async () => {
    server();
    render(<Dashboard />);
    fireEvent.click(researchButton());
    await screen.findByText("Banks lead Sensex gains", {}, { timeout: 4000 });
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText(/No article has been published/)).toBeVisible());
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

describe("Source limit", () => {
  it("blocks adding an 11th source in the UI, and allows it after removing one", async () => {
    server();
    render(<Dashboard />);
    expect(screen.getByText("10 of 10 configured", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Source" })).toBeDisabled();
    expect(screen.getByText(/Maximum of 10 reached/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove BSE India" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Source" })).toBeEnabled());
    expect(screen.getByText("9 of 10 configured", { exact: false })).toBeInTheDocument();
  });

  it("validates the URL before calling the server", async () => {
    server();
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Remove BSE India" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Source" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Add Source" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Local box" } });
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "http://192.168.0.5/" } });
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    expect(await screen.findByText("Only https:// URLs are allowed.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([u, i]) => u === "/api/sources" && i?.method === "POST"),
    ).toBe(false);
  });
});

describe("Research panel pipeline steps", () => {
  it("follows the server's current step in order", () => {
    expect(stepStates("idle", null)).toEqual(["idle", "idle", "idle", "idle"]);
    expect(stepStates("running", null)).toEqual(["active", "idle", "idle", "idle"]);
    const at = (currentStep: ResearchRun["currentStep"]) =>
      stepStates("running", run({ stage: "processing", currentStep }));
    expect(at("discover")).toEqual(["active", "idle", "idle", "idle"]);
    expect(at("evidence")).toEqual(["done", "active", "idle", "idle"]);
    expect(at("verify")).toEqual(["done", "done", "active", "idle"]);
    expect(at("draft")).toEqual(["done", "done", "done", "active"]);
    expect(stepStates("done", run())).toEqual(["done", "done", "done", "done"]);
  });

  it("shows the live step and counts while a run is processing", async () => {
    server({
      polls: [
        run({
          stage: "processing",
          currentStep: "verify",
          drafts: [],
          counts: { ...run().counts, processed: 1 },
        }),
      ],
    });
    render(<Dashboard />);
    fireEvent.click(researchButton());
    const panel = screen.getByRole("region", { name: "Research" });
    await waitFor(
      () =>
        expect(within(panel).getByText("Verify").closest("li")).toHaveTextContent("in progress"),
      { timeout: 4000 },
    );
    expect(within(panel).getByText("Evidence").closest("li")).toHaveTextContent("complete");
    expect(within(panel).getByText("Draft").closest("li")).toHaveTextContent("not started");
    expect(within(panel).getByText("1 verified · 1 held")).toBeInTheDocument();
    expect(within(panel).getByText("0 of 10 drafts")).toBeInTheDocument();
  });
});
