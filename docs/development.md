# Development

## Prerequisites

- Node.js ≥ 20.9
- pnpm 10 (`corepack enable`), or run any command as `npx pnpm@10.34.7 <script>`
- PostgreSQL only when working on database features; building and running the app don't need it

## First-time setup

```bash
pnpm install                          # also runs `prisma generate`
cp .env.example .env                  # fill in local values
pnpm exec playwright install chromium # only needed for e2e tests
pnpm dev                              # http://localhost:3000
```

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Start the dev server                           |
| `pnpm build`        | Production build                               |
| `pnpm start`        | Serve the production build                     |
| `pnpm lint`         | ESLint                                         |
| `pnpm typecheck`    | Generate route types and run `tsc --noEmit`    |
| `pnpm format`       | Format with Prettier                           |
| `pnpm format:check` | Check formatting                               |
| `pnpm test`         | Unit tests (Vitest)                            |
| `pnpm test:watch`   | Unit tests in watch mode                       |
| `pnpm test:e2e`     | E2E tests (Playwright; starts the dev server)  |
| `pnpm check`        | typecheck + lint + format:check + test         |
| `pnpm db:generate`  | Regenerate the Prisma client                   |
| `pnpm db:migrate`   | Create/apply migrations on your local database |

## Environment variables

| Variable                   | Needed for                  | Notes                                                                                |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | Prisma CLI, database access | The CMS's own PostgreSQL. Never Lemonn production.                                   |
| `GEMINI_API_KEY`           | Research ranking (Step 4)   | Optional. Gemini relevance screen; without it ranking is rules-only. Spends credits. |
| `GEMINI_MODEL_FAST`        | Research ranking (Step 4)   | Optional. Default `gemini-3.5-flash-lite`; falls back to legacy `GEMINI_MODEL`.      |
| `GEMINI_MODEL_REASONING`   | Claim verification (Step 5) | Optional. Default `gemini-3.8-flash`; matches claims to evidence.                    |
| `NEWS_RESEARCH_MAX_VERIFY` | Claim verification (Step 5) | Optional. Stories verified per run, 1–20 (default 12).                               |
| `TAVILY_API_KEY`           | Research discovery          | Tavily Search API. Needed for Reuters/NSE/BSE and sitemap fallback. Spends credits.  |

All variables are server-only. Validate new ones with Zod on the server and add a placeholder to
`.env.example`.

## Database

- Schema: `prisma/schema.prisma`. Config: `prisma.config.ts` (loads `.env` automatically).
- Research runs are stored in PostgreSQL, so the app needs `DATABASE_URL` (the CMS's own database,
  never Lemonn production). Locally: create a database, set `DATABASE_URL`, run `pnpm db:migrate`.
- After editing the schema: `pnpm db:migrate` (needs a local database), then commit the migration.
- Deployed databases: run `pnpm db:deploy` (`prisma migrate deploy`) against them before or during
  each deploy; it applies committed migrations only.
- First admin: sign up at `/signup`, then in the database run
  `UPDATE "User" SET role = 'admin' WHERE email = 'you@example.com';` (`team` for editors).
  Role changes apply on the next request; no sign-out needed.
- The generated client lives in `src/generated/prisma` and is not committed.

## Testing

- Unit tests go in `tests/unit/` (or next to code as `*.test.ts`), run in jsdom with
  Testing Library matchers available.
- E2E tests go in `tests/e2e/`. Playwright starts `pnpm dev` automatically.

## Adding UI components

```bash
pnpm dlx shadcn@latest add button
```

If the company npm mirror blocks the CLI, copy the component source from ui.shadcn.com into
`src/components/ui/` and install its listed dependencies.

## Troubleshooting

- **`pnpm` crashes with `ERR_MODULE_NOT_FOUND`**: the global install is broken. Use
  `npx pnpm@10.34.7 ...` or reinstall pnpm.
- **Install fails with 403 / ETARGET**: the company mirror hasn't released that version yet.
  Pin to an older version (see `overrides` in `pnpm-workspace.yaml`).

## Before opening a PR

```bash
pnpm check && pnpm build
```
