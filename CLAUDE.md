# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Lemonn News CMS: a standalone internal CMS that will become Lemonn's AI-assisted financial news tool.
**Current status: foundation only.** No CMS features, auth, database models or workers exist yet.

See [docs/architecture.md](docs/architecture.md) and [docs/development.md](docs/development.md).

## Hard rules

- This app is fully separate from `lemonn.co.in`. Never connect to Lemonn's production database,
  never modify the Lemonn website repo, never deploy anything.
- Never commit secrets. `.env` is gitignored; only `.env.example` (placeholders) is tracked.
- Never expose secrets to the browser: no `NEXT_PUBLIC_` prefix for private values.
  Server-only modules start with `import "server-only";`.
- Don't add queue, AI, auth or crawler dependencies until that phase is explicitly started.
- Keep scope tight: build only what the task asks for.

## Stack

Next.js 16 (App Router, `cacheComponents` on) · React 19 · TypeScript strict · Tailwind CSS 4 ·
shadcn/ui · Prisma 7 (PostgreSQL, `prisma-client` generator) · Zod 4 · ESLint · Prettier ·
Vitest · Playwright.

## Commands

The global pnpm on this machine may be broken; use `npx pnpm@10.34.7 <script>` if `pnpm` fails.

```bash
pnpm dev            # dev server, http://localhost:3000
pnpm typecheck      # next typegen + tsc
pnpm lint
pnpm format:check
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright (starts dev server)
pnpm build
pnpm check          # typecheck + lint + format:check + test
```

Run `pnpm check` and `pnpm build` before reporting work as done.

## Conventions

- Import alias: `@/*` → `src/*`.
- Server Components by default; add `"use client"` only when interactivity requires it.
- Validate external input and env with Zod at server boundaries.
- Prisma client is generated to `src/generated/prisma` (gitignored; regenerated on install).
  Import from `@/generated/prisma/client`.
- shadcn/ui components go in `src/components/ui`; use `cn()` from `@/lib/utils`.
- Unit tests: `tests/unit/**/*.test.ts(x)`. E2E tests: `tests/e2e/*.spec.ts`.
- `server-only` is stubbed in Vitest, so server modules can be unit tested.

## Environment quirks

- The company npm mirror (repo.peepal.co) quarantines very new releases. If an install fails with
  403/ETARGET, pin to the newest version the mirror serves (see `overrides` in `pnpm-workspace.yaml`).
- `shadcn add` may fail for the same reason; components can be added manually from ui.shadcn.com.
