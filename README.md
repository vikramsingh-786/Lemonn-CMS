# Lemonn News CMS

Standalone internal CMS that will become Lemonn's AI-assisted financial news tool.
It is fully separate from the `lemonn.co.in` application: its own repo, database and deployment.

**Status:** project foundation only. No CMS features, auth, database models or workers yet.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui ·
Prisma 7 (PostgreSQL) · Zod 4 · ESLint · Prettier · Vitest · Playwright

## Prerequisites

- Node.js ≥ 20.9
- pnpm 10 (`corepack enable`, or `npx pnpm@10.34.7 <command>`)
- PostgreSQL only when you start working on database features (not needed to build or run the app)

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

| Variable       | Required for                 | Notes                                              |
| -------------- | ---------------------------- | -------------------------------------------------- |
| `DATABASE_URL` | Prisma CLI / database access | The CMS's own PostgreSQL. Never Lemonn production. |

## Adding shadcn/ui components

shadcn/ui is configured in [components.json](components.json) (`@/components/ui`, `cn()` in `src/lib/utils.ts`).

```bash
pnpm dlx shadcn@latest add button
```

## Notes

- The company npm mirror quarantines very new releases; `pnpm-workspace.yaml` pins `vite` to the newest version it serves.
