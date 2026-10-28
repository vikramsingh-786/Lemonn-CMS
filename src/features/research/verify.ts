import "server-only";
import { DEFAULT_SOURCES, sourceDomain } from "@/features/dashboard/data";
import type { ServerEnv } from "@/lib/env";
import { pool } from "@/lib/pool";
import { FetchError, fetchApproved, isWithinDomain } from "@/lib/safe-fetch";
import { buildDraftQueue, verificationScore } from "./draft-score";
import { articleText, documentText, namesOrganisation, relevantExcerpt } from "./extract";
import { checkFigure, dateHint, stageSupported } from "./figures";
import {
  extractClaims,
  matchEvidence,
  type EvidenceLink,
  type ExtractedClaim,
  type GeminiAccess,
} from "./gemini";
import {
  cachedOfficialDomain,
  domainFromFiling,
  searchOfficialDomain,
  type DomainCheck,
} from "./official-domains";
import { saveRun } from "./run-store";
import { searchOfficial, searchWeb, type TavilyAccess } from "./tavily";
import {
  DRAFT_TARGET,
  type CandidateReport,
  type CandidateStatus,
  type ClaimAssessment,
  type ClaimStatus,
  type EvidenceRecord,
  type ResearchRun,
} from "./types";

const CONCURRENCY = 3;
/** Per verification pass (a retry gets a fresh allowance). */
const MAX_TAVILY_CALLS = 60;
const MAX_GEMINI_CALLS = 34;
const TIME_LIMIT_MS = 8 * 60_000;
const PAGES_PER_CLAIM = 2;
const ATTEMPTS_PER_CLAIM = 4;
const SNIPPETS_PER_CLAIM = 2;
const EVIDENCE_TO_MODEL = 8;
const EXCERPT_CHARS = 3000;
const DOC_TIMEOUT_MS = 20_000;
/** Official sources dated this long before the story cannot confirm a new event. */
const STALE_MS = 180 * 24 * 3_600_000;

const EXCHANGES = ["bseindia.com", "nseindia.com"];
/** Company claims of these types are filed with the exchanges, so filings are searched first. */
const FILING_TYPES = new Set([
  "earnings",
  "corporate_action",
  "ipo",
  "acquisition",
  "partnership",
  "leadership_change",
]);
/** Claims about a specific dated event (an old document cannot confirm them). */
const TIME_BOUND = new Set([
  ...FILING_TYPES,
  "regulation",
  "pricing",
  "product_launch",
  "macro",
  "market_movement",
]);
/** Major publishers for independent corroboration (secondary evidence only). */
const NEWS_DOMAINS = DEFAULT_SOURCES.filter((s) => !s.isPrimarySource).map(sourceDomain);

const MUTUAL_FUND = /mutual fund|\bnav\b|\bamc\b|\bscheme\b|\bsip\b|\bnfo\b|\betf\b/i;
const INDIAN = /₹|\brs\.?\s|\binr\b|crore|lakh|\bindia|\bsebi\b|\brbi\b|\bnse\b|\bbse\b/i;
const US = /\$|\bus\b|\bu\.s\.|\bnasdaq\b|\bnyse\b/i;

/** Pages that are never evidence: careers, help, search, login, contact, live quotes/market data. */
const NOT_EVIDENCE =
  /\/(?:careers?|jobs?|help|faqs?|support|search|login|sign-?in|contact(?:-us)?|get-quotes?|market-data)(?:[/?.#]|$)/i;
/** Annual reports (huge, rarely the event) and exchange language mirrors (duplicates). */
const SKIP =
  /annual[_-]?reports?|\/AR_\d|\/(?:hindi|bengali|telugu|marathi|gujarati|tamil|kannada|malayalam|odia|punjabi)\//i;
const PREFERRED =
  /investor|press|media|news|announcement|corpfiling|result|disclosure|circular|\.pdf(?:$|\?)/i;

const RETRYABLE = new Set<CandidateStatus>([
  "verification_failed",
  "not_processed",
  "queued",
  "pending_evidence",
  "verifying",
]);
/** Statuses of a story whose verification attempt has ended (failed ones included). */
const FINISHED = new Set<CandidateStatus>([
  "verified",
  "partially_verified",
  "conflicting_evidence",
  "unverified",
  "verification_failed",
]);
const NOT_FALSE = "This does not mean the story is false.";

type Claim = ExtractedClaim & { id: string };

type Evidence = {
  record: EvidenceRecord;
  /** Full retrieved text (page) or snippet; server-side only. */
  text: string;
  claimIds: Set<string>;
};

type Ctx = {
  run: ResearchRun;
  tavily: TavilyAccess;
  fast: GeminiAccess;
  reasoning: GeminiAccess;
  deadline: number;
  stopReason: string | null;
};

// ponytail: in-memory page cache (24h) so retries don't re-download the same documents; full
// text never leaves the server. Lost on restart.
const pageCache = ((
  globalThis as { __evidencePages?: Map<string, { text: string; until: number }> }
).__evidencePages ??= new Map());

const host = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

function countError(run: ResearchRun, provider: string, e: unknown) {
  const key = `${provider}:${e instanceof FetchError ? e.kind : "unavailable"}`;
  run.errorCounts[key] = (run.errorCounts[key] ?? 0) + 1;
}

/** Budget relative to the calls already used when this pass started. */
function budget(
  run: ResearchRun,
  field: "searchesUsed" | "aiCallsUsed",
  max: number,
  name: string,
) {
  const limit = run.counts[field] + max;
  return () => {
    if (run.counts[field] >= limit)
      throw new FetchError(
        "budget",
        `${name} call limit for this verification pass (${max}) reached`,
      );
    run.counts[field]++;
  };
}

function markNotProcessed(c: CandidateReport, reason: string) {
  c.status = "not_processed";
  c.statusReason = reason;
}

function warnOnce(run: ResearchRun, message: string) {
  if (!run.warnings.includes(message)) run.warnings.push(message);
}

/**
 * Step 5 on a run: verify the top candidates' material claims against official sources.
 * `retry`: only stories that failed or were not processed are verified again (same Run ID);
 * finished stories, discovery and ranking are left as they are.
 */
export async function verifyRun(
  run: ResearchRun,
  env: ServerEnv,
  opts: { retry?: boolean } = {},
): Promise<void> {
  const missing = [
    !env.TAVILY_API_KEY && "TAVILY_API_KEY",
    !env.GEMINI_API_KEY && "GEMINI_API_KEY",
  ].filter(Boolean);
  if (missing.length > 0 || run.candidates.length === 0) {
    if (missing.length > 0)
      warnOnce(run, `Verification skipped: ${missing.join(" and ")} not set. Stories stay queued.`);
    return;
  }
  const started = Date.now();
  run.stage = "processing";
  run.currentStep = "verify";
  const ctx: Ctx = {
    run,
    tavily: {
      apiKey: env.TAVILY_API_KEY,
      spendCall: budget(run, "searchesUsed", MAX_TAVILY_CALLS, "Tavily"),
    },
    fast: {
      apiKey: env.GEMINI_API_KEY!,
      model: env.GEMINI_MODEL_FAST,
      spendCall: budget(run, "aiCallsUsed", MAX_GEMINI_CALLS, "Gemini"),
    },
    reasoning: {
      apiKey: env.GEMINI_API_KEY!,
      model: env.GEMINI_MODEL_REASONING,
      spendCall: budget(run, "aiCallsUsed", MAX_GEMINI_CALLS, "Gemini"),
    },
    deadline: started + TIME_LIMIT_MS,
    stopReason: null,
  };

  // Verifiable (official-announcement) stories first, then by rank. Same order on retries.
  const order = [...run.candidates].sort(
    (a, b) => Number(b.verifiable === true) - Number(a.verifiable === true) || a.rank - b.rank,
  );
  const limit = env.NEWS_RESEARCH_MAX_VERIFY;
  for (const c of order.slice(limit)) {
    markNotProcessed(c, `Not in the top ${limit} verified per run (NEWS_RESEARCH_MAX_VERIFY).`);
  }
  const selected = order.slice(0, limit).filter((c) => !opts.retry || RETRYABLE.has(c.status));
  for (const c of selected) {
    c.status = "queued";
    c.statusReason = "Waiting for verification.";
  }

  let begun = 0;
  await pool(selected, CONCURRENCY, async (c) => {
    if (!ctx.stopReason && Date.now() > ctx.deadline)
      ctx.stopReason = "Time limit (8 min) reached.";
    if (ctx.stopReason)
      return markNotProcessed(c, `${ctx.stopReason} Not verified; retry to continue.`);
    run.stageDetail = `Verifying ${++begun} of ${selected.length}`;
    await verifyCandidate(c, ctx);
    summarise(run);
    void saveRun(run); // finished stories survive a crash or refresh
  });
  if (ctx.stopReason)
    warnOnce(run, `Verification stopped early: ${ctx.stopReason} Use Retry to continue.`);
  summarise(run);
  run.timings.push({ stage: opts.retry ? "verify_retry" : "verify", ms: Date.now() - started });
}

/** Counts and the draft queue, from the candidates' current statuses. */
function summarise(run: ResearchRun) {
  const processed = run.candidates.filter((c) => FINISHED.has(c.status));
  run.counts.processed = processed.length;
  run.counts.verified = processed.filter((c) => c.status === "verified").length;
  run.counts.held = processed.length - run.counts.verified;
  run.counts.notProcessed = run.candidates.filter((c) => c.status === "not_processed").length;
  run.draftQueue = buildDraftQueue(run.candidates, DRAFT_TARGET);
}

function resetForVerification(c: CandidateReport) {
  c.claims = [];
  c.evidence = [];
  c.entities = [];
  c.officialSources = [];
  c.evidenceSearchFailures = 0;
  c.primaryEvidenceFound = false;
  c.independentSources = 0;
  c.verificationScore = null;
  c.verificationScoreReasons = [];
}

async function verifyCandidate(c: CandidateReport, ctx: Ctx): Promise<void> {
  const { run } = ctx;
  resetForVerification(c);
  try {
    c.status = "pending_evidence";
    c.statusReason = "Reading the article.";
    const story = await readArticle(c, ctx);

    c.status = "verifying";
    c.statusReason = "Extracting claims.";
    const extracted = await extractClaims(
      { headline: c.headline, publisher: c.publisher, text: story },
      ctx.fast,
    );
    c.entities = extracted.entities;
    const claims: Claim[] = extracted.claims.map((cl, i) => ({ id: `${c.id}-k${i + 1}`, ...cl }));
    c.claims = claims.map((cl): ClaimAssessment => ({
      id: cl.id,
      claim: cl.text,
      type: cl.type,
      status: "unverified",
      materiality: cl.materiality,
      authority: cl.authority,
      figures: cl.figures,
      stage: cl.stage,
      links: [],
      evidenceUrls: [],
      explanation: cl.materiality === "low" ? "Low materiality: not checked." : "",
      gaps: "",
    }));
    const material = claims.filter((cl) => cl.materiality !== "low");
    if (material.length === 0) return finish(c, "No material claims found in the article.");

    c.statusReason = "Collecting official evidence.";
    const domains = new Map<string, DomainCheck>();
    const evidence = new Map<string, Evidence>(); // by URL
    for (const cl of material) await collectOfficial(c, cl, domains, evidence, ctx);
    c.officialSources = [...domains.values()];
    await collectSecondary(c, material, evidence, ctx);

    const items = [...evidence.values()];
    items.forEach((e, i) => (e.record.id = `${c.id}-e${i + 1}`));
    c.independentSources = independentPublishers(items, c.publisher, c.url);
    if (items.length === 0) {
      for (const a of c.claims)
        if (a.materiality !== "low") a.explanation = `No evidence was retrieved. ${NOT_FALSE}`;
      return finish(c, "No official or independent evidence was retrieved.");
    }

    c.statusReason = "Matching claims to evidence.";
    const toModel = pickForModel(items);
    const excerpts = new Map(
      items.map((e) => [
        e.record.id,
        relevantExcerpt(
          e.text,
          material.filter((cl) => e.claimIds.has(cl.id) || e.record.kind === "secondary"),
          EXCERPT_CHARS,
        ),
      ]),
    );
    for (const e of items) {
      const excerpt = excerpts.get(e.record.id)!;
      e.record.excerpt = (excerpt.split(" … ")[1] ?? excerpt).slice(0, 300);
    }
    c.evidence = items.map((e) => e.record);
    c.primaryEvidenceFound = items.some(
      (e) => e.record.kind === "primary" && e.record.retrieval === "page",
    );

    const links = await matchEvidence(
      {
        claims: material.map((cl) => ({
          id: cl.id,
          text: cl.text,
          authority: cl.authority,
          figures: cl.figures,
          stage: cl.stage,
        })),
        evidence: toModel.map((e) => ({
          id: e.record.id,
          sourceType: e.record.sourceType,
          organisation: e.record.organisation,
          url: e.record.url,
          title: e.record.title,
          excerpt: excerpts.get(e.record.id)!,
        })),
      },
      ctx.reasoning,
    );
    gate(c, material, toModel, links, domains);
  } catch (e) {
    if (e instanceof FetchError && e.kind === "budget") {
      ctx.stopReason ??= `${e.message}.`;
      return markNotProcessed(c, `${e.message}. Not verified; retry to continue.`);
    }
    countError(run, "verify", e);
    c.status = "verification_failed";
    c.statusReason = `${e instanceof FetchError ? e.message : "Verification failed"}. ${NOT_FALSE}`;
    for (const a of c.claims) if (a.materiality !== "low") a.status = "verification_failed";
    c.claimCounts = countClaims(c.claims);
  }
}

/** Official pages first (fresh, then stale), then official snippets, then secondary; ≤8 items. */
function pickForModel(items: readonly Evidence[]): Evidence[] {
  const priority = (e: Evidence) =>
    e.record.kind === "primary"
      ? e.record.retrieval === "page"
        ? e.record.stale
          ? 1
          : 0
        : 2
      : 3;
  return [...items].sort((a, b) => priority(a) - priority(b)).slice(0, EVIDENCE_TO_MODEL);
}

/** Lead article text from the publisher's own domain; headline (+ other titles) if unavailable. */
async function readArticle(c: CandidateReport, ctx: Ctx): Promise<string> {
  const fallback = [c.headline, ...c.otherReports.map((r) => r.title)].join("\n");
  const page = await fetchPage(c.url, [host(c.url)], ctx, ["html"]);
  if (page === null) return fallback;
  const { text } = articleText(page);
  return text.length > 0 ? `${c.headline}\n${text}` : fallback;
}

/**
 * Text of a page/PDF through safe-fetch (cached 24h for retries); null on failure (counted,
 * never thrown). HTML is returned raw for `html`-only reads (article extraction needs markup).
 */
async function fetchPage(
  url: string,
  domains: readonly string[],
  ctx: Ctx,
  accept: ("html" | "pdf" | "text")[],
): Promise<string | null> {
  const key = `${accept.join(",")}|${url}`;
  const cached = pageCache.get(key);
  if (cached && cached.until > Date.now()) return cached.text;
  const { counts } = ctx.run;
  counts.pagesAttempted++;
  try {
    const doc = await fetchApproved(url, domains, accept, DOC_TIMEOUT_MS);
    const text =
      accept.length === 1 && accept[0] === "html"
        ? new TextDecoder().decode(doc.bytes)
        : await documentText(doc).catch(() => ""); // unreadable/scanned PDF → ""
    counts.pagesFetched++;
    pageCache.set(key, { text, until: Date.now() + 24 * 3_600_000 });
    return text;
  } catch (e) {
    if (e instanceof FetchError && e.kind === "blocked") counts.pagesBlocked++;
    countError(ctx.run, "fetch", e);
    return null;
  }
}

/**
 * Where to look for a claim (dynamic, by authority and claim type):
 * Indian company filings (BSE/NSE) → the authority's own domain (known map, cache, the company's
 * own filing, then search) → mutual funds also AMFI + SEBI → US companies also SEC.
 */
async function collectOfficial(
  c: CandidateReport,
  cl: Claim,
  domains: Map<string, DomainCheck>,
  evidence: Map<string, Evidence>,
  ctx: Ctx,
) {
  const isCompany = cl.authorityKind === "company";
  const context = `${cl.text} ${cl.figures.join(" ")} ${c.headline}`;
  const indian = INDIAN.test(context);
  const budgetLeft = {
    attempts: ATTEMPTS_PER_CLAIM,
    pages: PAGES_PER_CLAIM,
    snippets: SNIPPETS_PER_CLAIM,
  };

  if (isCompany && indian && FILING_TYPES.has(cl.type)) {
    await searchAndRead(c, cl, EXCHANGES, evidence, budgetLeft, ctx);
  }

  let check = domains.get(cl.authority) ?? cachedOfficialDomain(cl.authority);
  if (!check && isCompany) {
    for (const e of evidence.values()) {
      if (e.record.sourceType !== "official_filing" || e.record.retrieval !== "page") continue;
      check = domainFromFiling(e.text, cl.authority, namesOrganisation(e.text, cl.authority));
      if (check) break;
    }
  }
  if (!check) {
    check = await searchOfficialDomain(cl.authority, cl.authorityWebsite, async (q) =>
      (await searchWeb(q, ctx.tavily, 10)).map((r) => host(r.url)),
    ).catch((e: unknown) => {
      if (e instanceof FetchError && e.kind === "budget") throw e;
      countError(ctx.run, "tavily", e);
      return {
        entity: cl.authority,
        domain: null,
        status: "not_found",
        reason: "Website search failed",
      } as DomainCheck;
    });
  }
  domains.set(cl.authority, check);

  const extra: string[][] = [];
  if (check.domain) extra.push([check.domain]);
  if (MUTUAL_FUND.test(context))
    extra.push(["amfiindia.com", "sebi.gov.in"].filter((d) => d !== check.domain));
  if (isCompany && !indian && US.test(context)) extra.push(["sec.gov"]);
  for (const ds of extra) {
    if (budgetLeft.pages <= 0 || budgetLeft.attempts <= 0) break;
    if (ds.length > 0) await searchAndRead(c, cl, ds, evidence, budgetLeft, ctx);
  }
}

/** One restricted search + reading the best results within the claim's attempt/page budget. */
async function searchAndRead(
  c: CandidateReport,
  cl: Claim,
  domains: readonly string[],
  evidence: Map<string, Evidence>,
  left: { attempts: number; pages: number; snippets: number },
  ctx: Ctx,
) {
  let results;
  try {
    results = await searchOfficial(
      { query: `${cl.authority} ${cl.text}`, domains, maxResults: 5 },
      ctx.tavily,
    );
  } catch (e) {
    if (e instanceof FetchError && e.kind === "budget") throw e;
    c.evidenceSearchFailures++;
    countError(ctx.run, "tavily", e);
    return;
  }
  const usable = results
    .filter((r) => {
      try {
        const u = new URL(r.url);
        return (
          u.protocol === "https:" &&
          domains.some((d) => isWithinDomain(u.hostname, d)) &&
          !NOT_EVIDENCE.test(u.pathname) &&
          !SKIP.test(u.pathname)
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => Number(PREFERRED.test(b.url)) - Number(PREFERRED.test(a.url)));

  const isCompany = cl.authorityKind === "company";
  const storyTime = c.publishedAt ? Date.parse(c.publishedAt) : Date.now();
  for (const r of usable) {
    if (left.pages <= 0 || left.attempts <= 0) break;
    const existing = evidence.get(r.url);
    if (existing) {
      existing.claimIds.add(cl.id);
      if (existing.record.retrieval === "page") left.pages--;
      continue;
    }
    left.attempts--;
    const isFiling = EXCHANGES.some((d) => isWithinDomain(host(r.url), d));
    const text = (await fetchPage(r.url, domains, ctx, ["html", "pdf", "text"])) ?? "";
    const page = text.length >= 50;
    // Exchange search often returns other companies' filings: skip those, try the next result.
    if (page && isFiling && isCompany && !namesOrganisation(text, cl.authority)) continue;
    if (!page && left.snippets <= 0) continue;
    const dated = dateHint(r.url, r.publishedAt);
    evidence.set(r.url, {
      text: page ? text : r.snippet,
      claimIds: new Set([cl.id]),
      record: {
        id: "",
        kind: "primary",
        sourceType: isFiling
          ? "official_filing"
          : isCompany
            ? "official_company"
            : "government_regulator",
        organisation: cl.authority,
        url: r.url,
        title: r.title,
        publisher: host(r.url),
        publishedAt: r.publishedAt,
        retrieval: page ? "page" : "snippet",
        retrievedAt: new Date().toISOString(),
        excerpt: "",
        stale: TIME_BOUND.has(cl.type) && dated !== null && dated.getTime() < storyTime - STALE_MS,
      },
    });
    if (page) left.pages--;
    else left.snippets--;
  }
}

/** Independent corroboration: the cluster's other reports + one news search. Never verifies. */
async function collectSecondary(
  c: CandidateReport,
  material: readonly { id: string }[],
  evidence: Map<string, Evidence>,
  ctx: Ctx,
) {
  const add = (url: string, title: string, text: string, publishedAt: string | null) => {
    if (evidence.has(url) || url === c.url) return;
    evidence.set(url, {
      text,
      claimIds: new Set(material.map((m) => m.id)),
      record: {
        id: "",
        kind: "secondary",
        sourceType: "independent_news",
        organisation: host(url),
        url,
        title,
        publisher: host(url),
        publishedAt,
        retrieval: "snippet",
        retrievedAt: new Date().toISOString(),
        excerpt: "",
      },
    });
  };
  for (const r of c.otherReports) add(r.url, r.title, r.title, r.publishedAt);
  try {
    const results = await searchOfficial(
      { query: c.headline, domains: NEWS_DOMAINS, maxResults: 3 },
      ctx.tavily,
    );
    for (const r of results) add(r.url, r.title, `${r.title}\n${r.snippet}`, r.publishedAt);
  } catch (e) {
    if (e instanceof FetchError && e.kind === "budget") throw e;
    c.evidenceSearchFailures++;
    countError(ctx.run, "tavily", e);
  }
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

/**
 * Distinct publishers among secondary evidence, excluding the story's own publisher. Reports
 * whose text is a near copy of another (syndicated wire copy) count once.
 */
export function independentPublishers(
  items: readonly Evidence[],
  leadPublisher: string,
  leadUrl: string,
): number {
  const leadHost = host(leadUrl);
  const groups: { text: Set<string>; publishers: Set<string> }[] = [];
  for (const e of items) {
    if (e.record.kind !== "secondary" || e.record.publisher === leadHost) continue;
    const text = words(e.text);
    const copy = groups.find((g) => overlap(g.text, text) >= 0.8);
    if (copy) copy.publishers.add(e.record.publisher);
    else groups.push({ text, publishers: new Set([e.record.publisher]) });
  }
  const publishers = new Set<string>();
  for (const g of groups) publishers.add([...g.publishers][0]!); // one per original report
  publishers.delete(leadPublisher);
  return publishers.size;
}

/**
 * THE GATE: the only place claim and story statuses are decided (AI confidence never is).
 *
 * Claim: conflicting_evidence if an official source contradicts it; verified if an
 * authoritative page/PDF (the authority's validated domain, or an exchange filing naming the
 * company; not stale) supports it AND every figure and the deal stage appear in that text;
 * partially_verified if supported only by snippets, secondary news, another organisation's page,
 * a stale page, or with a figure/stage missing; otherwise unverified.
 *
 * Story roll-up (material = high + medium claims): any conflicting → conflicting_evidence;
 * all verified → verified; any verified/partial → partially_verified; else unverified.
 * Output that is unparseable or references unknown ids → verification_failed.
 */
export function gate(
  c: CandidateReport,
  material: readonly Claim[],
  items: readonly Evidence[],
  links: readonly EvidenceLink[],
  domains: Map<string, DomainCheck>,
) {
  const byId = new Map(items.map((e) => [e.record.id, e]));
  const claimIds = new Set(material.map((m) => m.id));
  if (links.some((l) => !claimIds.has(l.claimId) || !byId.has(l.evidenceId))) {
    for (const a of c.claims) if (a.materiality !== "low") a.status = "verification_failed";
    c.claimCounts = countClaims(c.claims);
    c.status = "verification_failed";
    c.statusReason = `The AI matching output referenced unknown claims or evidence. ${NOT_FALSE}`;
    return;
  }

  for (const cl of material) {
    const a = c.claims.find((x) => x.id === cl.id)!;
    const mine = links.filter((l) => l.claimId === cl.id);
    const authDomain = domains.get(cl.authority)?.domain ?? null;
    const official = (e: Evidence) =>
      e.record.kind === "primary" &&
      e.record.retrieval === "page" &&
      ((authDomain !== null && isWithinDomain(e.record.publisher, authDomain)) ||
        (e.record.sourceType === "official_filing" &&
          cl.authorityKind === "company" &&
          namesOrganisation(e.text, cl.authority)));
    const supports = mine.filter((l) => l.relation === "supports");
    const contradiction = mine.find(
      (l) => l.relation === "contradicts" && byId.get(l.evidenceId)!.record.kind === "primary",
    );
    const authSupport = supports.filter((l) => official(byId.get(l.evidenceId)!));
    const fresh = authSupport.filter((l) => !byId.get(l.evidenceId)!.record.stale);
    const checks = fresh.map((l) => {
      const text = byId.get(l.evidenceId)!.text;
      const notes = [...cl.figures.map((f) => checkFigure(f, text)), stageSupported(cl.stage, text)]
        .filter((r) => !r.found)
        .map((r) => r.note);
      return { link: l, notes };
    });
    const full = checks.find((x) => x.notes.length === 0);

    a.links = mine.map((l) => ({ evidenceId: l.evidenceId, relation: l.relation }));
    a.evidenceUrls = mine
      .filter((l) => l.relation !== "does_not_establish")
      .map((l) => byId.get(l.evidenceId)!.record.url);
    a.gaps = [...new Set(mine.map((l) => l.unconfirmed.trim()).filter(Boolean))].join(" ");

    let status: ClaimStatus;
    let why: string;
    if (contradiction) {
      status = "conflicting_evidence";
      why = `An official source contradicts it: ${contradiction.explanation}`;
    } else if (full) {
      status = "verified";
      why = `Confirmed by ${cl.authority}'s official source, figures and dates included: ${full.link.explanation}`;
    } else if (checks.length > 0) {
      status = "partially_verified";
      why = `The official source supports it, but ${[...new Set(checks.flatMap((x) => x.notes))].join("; ")}.`;
    } else if (authSupport.length > 0) {
      status = "partially_verified";
      why = "Only an older official document supports it; it cannot confirm this new event.";
    } else if (supports.length > 0) {
      const ev = byId.get(supports[0]!.evidenceId)!;
      status = "partially_verified";
      why =
        ev.record.kind === "secondary"
          ? `Only independent news reports support it (${c.independentSources} independent publisher(s)), not an official source.`
          : ev.record.retrieval === "snippet"
            ? "Only a search snippet of an official source supports it; the page could not be read."
            : `Supported by an official page that is not ${cl.authority}'s own.`;
    } else {
      status = "unverified";
      why = `No retrieved evidence establishes this claim. ${NOT_FALSE}`;
    }
    a.status = status;
    a.explanation = why;
  }

  c.claimCounts = countClaims(c.claims);
  rollUp(c);
}

/** Story status from its material claims (documented on gate()). */
export function rollUp(c: CandidateReport) {
  const statuses = c.claims.filter((a) => a.materiality !== "low").map((a) => a.status);
  const verified = statuses.filter((s) => s === "verified").length;
  if (statuses.includes("conflicting_evidence")) {
    c.status = "conflicting_evidence";
    c.statusReason =
      "An official source contradicts at least one material claim. Kept for editors.";
  } else if (statuses.length > 0 && verified === statuses.length) {
    c.status = "verified";
    c.statusReason = `All ${statuses.length} material claim(s) confirmed by official sources, figures included.`;
  } else if (statuses.some((s) => s === "verified" || s === "partially_verified")) {
    c.status = "partially_verified";
    c.statusReason = `${verified} of ${statuses.length} material claim(s) fully verified; the rest have only partial support.`;
  } else {
    c.status = "unverified";
    c.statusReason = `No material claim could be established from retrieved evidence. ${NOT_FALSE}`;
  }
  const { score, reasons } = verificationScore(c);
  c.verificationScore = score;
  c.verificationScoreReasons = reasons;
}

function countClaims(claims: readonly ClaimAssessment[]): Record<ClaimStatus, number> {
  const counts: Record<ClaimStatus, number> = {
    verified: 0,
    partially_verified: 0,
    conflicting_evidence: 0,
    unverified: 0,
    verification_failed: 0,
  };
  for (const a of claims) if (a.materiality !== "low") counts[a.status]++;
  return counts;
}

/** Finalises a story with no claims to check or no evidence. */
function finish(c: CandidateReport, reason: string) {
  c.claimCounts = countClaims(c.claims);
  c.status = "unverified";
  c.statusReason = `${reason} ${NOT_FALSE}`;
  c.verificationScore = 0;
  c.verificationScoreReasons = [];
}
