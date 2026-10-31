# Lemonn News CMS

Standalone internal CMS that will become Lemonn's AI-assisted financial news tool.
It is fully separate from the `lemonn.co.in` application: its own repo, database and deployment.

**Status:** research pipeline prototype. The dashboard runs discovery, ranking, claim verification and
drafting; editors edit drafts as articles and mark them ready. Data is in PostgreSQL, behind a
per-user accounts with roles (admin, team, read-only). No background worker or publishing yet.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui ·
Prisma 7 (PostgreSQL) · Zod 4 · ESLint · Prettier · Vitest · Playwright

## Prerequisites

- Node.js ≥ 20.9
- pnpm 10 (`corepack enable`, or `npx pnpm@10.34.7 <command>`)
- PostgreSQL for running research (runs are stored there); not needed to build the app

## Setup

```bash
pnpm install          # also runs `prisma generate`
cp .env.example .env  # then fill in local values
pnpm dev              # http://localhost:3000
```

## Scripts

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `pnpm dev`          | Start the dev server                                 |
| `pnpm build`        | Production build                                     |
| `pnpm start`        | Serve the production build                           |
| `pnpm lint`         | ESLint                                               |
| `pnpm typecheck`    | Generate route types and run `tsc --noEmit`          |
| `pnpm format`       | Format with Prettier                                 |
| `pnpm format:check` | Check formatting                                     |
| `pnpm test`         | Unit tests (Vitest)                                  |
| `pnpm test:watch`   | Unit tests in watch mode                             |
| `pnpm test:e2e`     | End-to-end tests (Playwright; starts the dev server) |
| `pnpm db:generate`  | Regenerate the Prisma client                         |
| `pnpm db:migrate`   | Create/apply migrations against your local database  |

First-time Playwright use needs a browser: `pnpm exec playwright install chromium`.

## Environment variables

See [.env.example](.env.example). All variables are server-only; never prefix secrets with `NEXT_PUBLIC_`.

| Variable                   | Required for                           | Notes                                              |
| -------------------------- | -------------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`             | Research runs, Prisma CLI              | The CMS's own PostgreSQL. Never Lemonn production. |
| `TAVILY_API_KEY`           | Verification; sources without sitemap  | Also the fallback when a sitemap fails             |
| `GEMINI_API_KEY`           | Relevance screen, verification, drafts | Without it, ranking is rules only                  |
| `GEMINI_MODEL_FAST`        | Optional                               | Default `gemini-3.5-flash-lite`                    |
| `GEMINI_MODEL_REASONING`   | Optional                               | Default `gemini-3.8-flash`                         |
| `NEWS_RESEARCH_MAX_VERIFY` | Optional                               | Stories verified per run, 1–20 (default 12)        |

## Adding shadcn/ui components

shadcn/ui is configured in [components.json](components.json) (`@/components/ui`, `cn()` in `src/lib/utils.ts`).

```bash
pnpm dlx shadcn@latest add button
```

## Notes

- The company npm mirror quarantines very new releases; `pnpm-workspace.yaml` pins `vite` to the newest version it serves.
