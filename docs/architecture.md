# Architecture

## Purpose

Lemonn News CMS will research financial news, generate article drafts with AI, let an authorized
admin review them, and publish approved articles to the Lemonn public website.

## Current state

The dashboard and the full research pipeline exist as a prototype: discovery, ranking, claim
verification and drafting. Runs live in PostgreSQL (`ResearchRun` table via Prisma,
`run-store.ts`): the run snapshot in `data`, the official evidence passages for drafting in
`evidence` (never returned by the API). `POST /api/research` only creates a run; the dashboard
then calls `POST /api/research/[runId]/step` in a loop, and each call does one bounded piece of
work and saves it (`pipeline.ts`): discover → rank → verify 3 stories per step → draft 2 per step
→ completed. A per-run lock in the database (`stepLockUntil`) lets one request work on a run at a
time; a cut-off step is repeated by the next one. This fits serverless limits (Vercel: 300 s per
request). A run belongs to the account that started it: only that account's pages (or an admin's) drive, retry or cancel it; everyone else's pages watch it. Admins manage every run on `/admin/runs`: stop a running one, resume a stopped, cancelled or failed one where it stopped (`prepareResume`), or delete one with its articles. Closing the tab pauses a run; reopening it within 30 minutes resumes it. After 30 minutes without progress it is stopped for good (`getRun`), so an old run is never resumed on a stale window. Discovery reads
publishers' Google News sitemaps (config in `src/features/research/sitemaps.ts`) or, for sources
without one, searches Tavily. It keeps stories from the last 24 hours on 7 topics (`src/features/research/topics.ts`): a title keyword decides; the publisher's keyword tags or a search excerpt count only in a business section, and non-finance sections are dropped. At most 200 per source; the dropped stories (newest 100 per source) are saved in their own column and listed on the research page when opened. Admins choose which sources are on by default (`/admin/sources`, `SourceSetting`); the dashboard switches change one run. Publisher fetches go through
`src/lib/safe-fetch.ts`. Step 4 (`rank.ts`, weights in `rank-config.ts`) then drops undated and
non-article items, merges duplicate reports, scores candidates with rules (announcement > topic >
source > coverage > recency, minus noise penalties), keeps each publisher's top 20 and, when
`GEMINI_API_KEY` is set, adds a Gemini relevance screen (`gemini.ts`), falling back to rules
only. Step 5 (`verify.ts`) checks the top candidates' material claims against
the responsible organisation's official source (exchange filings, company or regulator site;
domains resolved in `official-domains.ts`), reading pages/PDFs through `safe-fetch.ts` (`unpdf`
for PDFs). Claim and story statuses are decided by application code (`gate()`), never by the
AI. Verified stories are queued for drafting by an evidence score (`draft-score.ts`, at most
`DRAFT_TARGET`). While fewer than `DRAFT_MIN` (5) meet the evidence bar, verification continues
down the ranking (up to 8 extra stories). Every other partially verified story is queued too:
its draft states verified claims as fact and attributes partially verified ones ("according to
media reports"), lists them for the author, and is never marked ready for review. Step 6 (`draft.ts`) has Gemini write an original article from verified claims
and their official evidence only, then runs deterministic checks (`draft-checks.ts`).
`POST /api/research/[runId]/verify` and `/draft` prepare a retry of only failed or unfinished
stories; the step loop then runs it.
The source list is fixed in `src/features/dashboard/data.ts` (on/off per browser tab).

Editing: an editor opens a draft from the dashboard (`Edit`), which creates an `Article` row: a
working copy of the AI draft (the run's draft stays untouched). `/articles` lists articles across
runs; `/articles/[id]` is the editor (`src/features/articles/`): headline, summary, a Markdown
subset body (headings, lists, quotes, bold, italic, rendered as React elements, never raw HTML),
SEO fields, category and tags, beside a fact sheet of the story's claims and evidence. Every save
re-runs the draft checks against the story's evidence (`checkArticle`). Status: `draft` →
`ready` (figures, copying and advice checks must pass; a partially verified story also needs the
editor's confirmation) or `rejected`; editing a ready article returns it to `draft`. Saves carry
a `version`, so a stale tab gets 409 instead of overwriting.

Accounts (`src/lib/auth.ts`, `roles.ts`): anyone can sign up at `/signup` with an email and a
password (≥ 10 characters, scrypt-hashed, `password.ts`); new accounts get role `user`
(read-only). Admins change roles on `/admin/users` (not their own, so an admin always remains): `admin` (everything),
`team` (run, cancel and retry research; edit articles and mark them ready or rejected), `user`
(view only; a read-only page polls a run instead of driving its steps, so it never spends API
credits). A session is a random cookie token whose SHA-256 is the `Session` row id: 7 days idle
(sliding), 30 days at most; signing out deletes the row, and changing the password ends the other
sessions. `proxy.ts` only checks that the cookie exists; every page calls `requireUser` and every
API route `requireApi(permission)` (401 when signed out, 403 when the role lacks the permission).
Sign-in and sign-up attempts are limited per email and per IP (`LoginAttempt`). Runs record who
started them, articles who last saved them.

Not built yet: a background worker (runs advance only while the dashboard is open),
source management, publishing and the audit log.

## System boundaries

```text
┌──────────────────────────┐        ┌──────────────────────┐
│  Lemonn News CMS (web)   │        │  Research worker     │  planned
│  Next.js, cms.lemonn...  │◀──────▶│  separate process    │
└────────────┬─────────────┘ queue  └──────────┬───────────┘
             │                                 │
             ▼                                 ▼
      ┌──────────────────────────────────────────────┐
      │  CMS PostgreSQL (own database, own creds)    │
      └──────────────────────────────────────────────┘
             │
             │ authenticated publishing API (planned, needs approval)
             ▼
      ┌──────────────────────────┐
      │  lemonn.co.in (existing) │   never touched directly
      └──────────────────────────┘
```

- **Separate repo, database, credentials and deployment** from `lemonn.co.in`.
- The CMS never connects to Lemonn's production database. Publishing happens only through an
  approved, authenticated API.
- Long-running work (crawling, AI calls) runs in a separate worker, never in Next.js request handlers.

## Components

| Component       | Responsibility                                | Status                |
| --------------- | --------------------------------------------- | --------------------- |
| Web app         | Admin UI, server actions, input validation    | Foundation            |
| Database        | CMS data via Prisma + PostgreSQL              | Configured, no models |
| Authentication  | Company identity provider, admin roles        | Planned               |
| Job queue       | Durable queue between web app and worker      | Planned               |
| Research worker | Fetch approved sources, dedupe, verify, draft | Planned               |
| Publishing      | Push approved articles to Lemonn via API      | Planned               |

## Planned data flow

1. Admin manages an allowlist of approved news sources.
2. Admin (or a schedule) enqueues a research job.
3. Worker fetches recent news from approved sources only, deduplicates and ranks stories.
4. Worker verifies claims against primary sources and generates evidence-backed drafts.
5. Admin reviews, edits, approves or rejects drafts in the CMS.
6. Approved drafts are published to the Lemonn website via the publishing API.
7. Significant actions are recorded in an audit log.

## Code layout

```text
src/
  app/            Next.js routes (App Router) and API routes (api/research)
  components/     Layout and shadcn/ui components (ui/)
  features/
    dashboard/    Dashboard UI and the default source list (data.ts)
    research/     Research pipeline: discovery, rank, verify, draft, run store
  lib/            Shared utilities (env.ts, safe-fetch.ts, pool.ts, utils.ts)
  generated/      Prisma client (generated, gitignored)
prisma/           Schema and, later, migrations
tests/unit/       Vitest
tests/e2e/        Playwright
```

## Security principles

- Secrets live only in server environment variables; never `NEXT_PUBLIC_`.
- Validate all external input with Zod at server boundaries.
- Every page and API route checks the session and the role on the server; the proxy is only a
  fast redirect. Anyone with the URL can sign up (read-only), so read-only users can see drafts.
- The worker must treat fetched web content as untrusted: domain allowlist, SSRF protection,
  timeouts and rate limits.
