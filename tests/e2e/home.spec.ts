import { expect, test } from "@playwright/test";

const MOCK_RUN = {
  runId: "e2e00001",
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
    {
      id: "C2",
      rank: 2,
      headline: "Jio plans IPO",
      url: "https://www.livemint.com/jio",
      publisher: "Mint Markets",
      publishedAt: "2026-10-27T09:00:00Z",
      otherReports: [],
      status: "unverified",
      statusReason: "No material claim is supported by the retrieved evidence.",
      primaryEvidenceFound: false,
      claims: [],
      claimCounts: { supported: 0, partially_supported: 0, contradicted: 0, unresolved: 1 },
      evidence: [],
      evidenceSearchFailures: 0,
      draftId: null,
    },
  ],
  drafts: [
    {
      id: "e2e00001-C1",
      candidateId: "C1",
      headline: "Banks lead Sensex gains",
      summary: "Bank stocks led gains, an NSE notice shows.",
      body: "Body text.",
      seoTitle: "Bank stocks lift Sensex",
      seoDescription: "Bank stocks led gains.",
      originalUrl: "https://www.livemint.com/a",
      publisher: "Mint Markets",
      sourcePublishedAt: "2026-10-27T10:00:00Z",
      officialEvidenceUrls: ["https://www.nseindia.com/notice"],
      secondaryEvidenceUrls: [],
      verificationStatus: "verified",
      claimEvidence: [
        { claim: "Banks rallied", evidenceUrls: ["https://www.nseindia.com/notice"] },
      ],
      readiness: "ready_for_review",
      readinessReason: "Every figure traces to verified evidence. Ready for editorial review.",
      researchedAt: "2026-10-27T12:00:00Z",
    },
  ],
  warnings: [],
  errorCounts: {},
  timings: [{ stage: "discovery", ms: 3200 }],
  shortfallReasons: [
    "Only 2 unique stories from the last 24 hours were found across 1 enabled source(s).",
  ],
  error: null,
};

/** Mocks start (POST) + polling (GET) so no real provider credits are used. */
async function mockResearch(page: import("@playwright/test").Page, counter = { posts: 0 }) {
  await page.route("/api/research", (route) => {
    counter.posts++;
    return route.fulfill({ status: 202, json: { runId: MOCK_RUN.runId } });
  });
  await page.route("/api/research/*", (route) => route.fulfill({ json: MOCK_RUN }));
  return counter;
}

test.describe("dashboard", () => {
  test("lists all 10 research sources with external links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "News Research Dashboard" })).toBeVisible();

    const sources = page.locator("#sources ol > li");
    await expect(sources).toHaveCount(10);
    await expect(page.locator('#sources a[target="_blank"]')).toHaveCount(10);
    await expect(page.locator('a[href="https://www.bseindia.com/"]')).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  test("toggling a source updates its state and the enabled count", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("switch", { name: "Use Mint Markets for research" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("0 enabled · max 10")).toBeVisible();
  });

  test("research starts a run and shows verified drafts (mocked, no real credits)", async ({
    page,
  }) => {
    const counter = await mockResearch(page);
    await page.goto("/");
    await expect(page.getByText("No research results yet")).toBeVisible();

    await page.getByRole("button", { name: "Research News" }).click();
    await expect(page.getByText("Banks lead Sensex gains")).toBeVisible();
    await expect(page.getByText("Awaiting editorial review")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Verification" }).getByText("Jio plans IPO"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Live Research Feed" })
        .getByRole("link", { name: /Jio plans IPO/ }),
    ).toBeVisible();
    await expect(page.getByText(/Why fewer than 10 verified drafts/)).toBeVisible();
    expect(counter.posts).toBe(1);
  });

  test("source limit: Add Source is disabled at 10 sources", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/10 of 10 configured/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Source" })).toBeDisabled();
  });

  test("research errors are shown with a retry", async ({ page }) => {
    await page.route("/api/research", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: "not_configured",
            message:
              "Research is not configured. Set TAVILY_API_KEY in .env and restart the server.",
            retryable: false,
          },
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Research News" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Research is not configured" });
    await expect(alert).toContainText("Research is not configured");
    await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("publish only opens a mock dialog", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") requests.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await mockResearch(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Research News" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Publishing is not connected" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("No article has been published");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // The only write is starting research; Publish sends nothing anywhere.
    expect(requests).toEqual(["POST /api/research"]);
  });

  test("mobile layout has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test("theme toggle switches and remembers light/dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");

  const toggle = page.getByRole("button", { name: "Dark theme" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light"); // persisted, applied before paint
});

test("first visit follows the system color scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("theme cursor: accent arrow, with a click marker on interactive elements", async ({
  page,
}) => {
  await page.goto("/");
  const cursorOf = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursorOf("body")).toContain("url(");
  const onButton = await cursorOf("button:not(:disabled)");
  expect(onButton).toContain("url(");
  expect(onButton).toContain("pointer"); // system fallback
  expect(onButton).not.toBe(await cursorOf("body"));
});
