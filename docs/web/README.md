# Web Docs

Documentation hub for `apps/web` (the Next.js LogiSync frontend).

## Quick start

```bash
pnpm install
pnpm --filter @logisync/web dev
```

The web app runs at <http://localhost:3000>. It expects the API at
`http://localhost:9751` by default (override via
`NEXT_PUBLIC_API_BASE_URL`).

## Where to find things

* **App overview & layout** — [`apps/web/README.md`](../../apps/web/README.md).
* **Development guidelines** —
  [`apps/web/README_DEVELOPMENT_GUIDELINES.md`](../../apps/web/README_DEVELOPMENT_GUIDELINES.md):
  Server vs. Client Components, the Repository Pattern with React
  Query, Zustand for global state, Zod for validation, and auth
  cookies.
* **Refactor history** —
  [`docs/web/implementation-plan-for-refactor-web.md`](./implementation-plan-for-refactor-web.md):
  the plan that drove the current shape of the codebase.

## TODO

The following docs are still pending and should be written by the
team that owns the relevant feature area:

* Design-system reference (Tailwind v4 tokens, component primitives).
* Routing and data-fetching deep dive (per-role dashboards).
* Testing strategy (E2E + unit conventions once tests exist).
