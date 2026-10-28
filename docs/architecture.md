# Architecture

## Purpose

Lemonn News CMS will research financial news, generate article drafts with AI, let an authorized
admin review them, and publish approved articles to the Lemonn public website.

## Current state

The dashboard UI and research Step 3 (discovery) exist. `POST /api/research` starts a background
run in server memory and `GET /api/research/[runId]` returns its progress. Discovery reads
publishers' Google News sitemaps (config in `src/features/research/sitemaps.ts`) or, for sources
without one, searches Tavily. It keeps stories from the last 24 hours on 8 topics
(`src/features/research/topics.ts`), at most 20 per source. Publisher fetches go through
`src/lib/safe-fetch.ts`. There is still no database, queue, worker, auth, verification or drafting.
Runs are lost on restart.

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
  app/            Next.js routes (App Router)
  components/ui/  shadcn/ui components (added as needed)
  lib/            Shared server/client utilities (env.ts, utils.ts)
  generated/      Prisma client (generated, gitignored)
prisma/           Schema and, later, migrations
tests/unit/       Vitest
tests/e2e/        Playwright
```

## Security principles

- Secrets live only in server environment variables; never `NEXT_PUBLIC_`.
- Validate all external input with Zod at server boundaries.
- Real authentication must exist before the CMS is reachable beyond local development.
- The worker must treat fetched web content as untrusted: domain allowlist, SSRF protection,
  timeouts and rate limits.
