# @logisync/web

The LogiSync web frontend. A Next.js (App Router) application that
serves the buyer, supplier, carrier, HR, company-admin, and
platform-admin experiences from a single multi-tenant codebase.

## Quick start

```bash
pnpm install
pnpm --filter @logisync/web dev
```

Open <http://localhost:3000>. The dev server expects an API at
`http://localhost:9751` (override via `NEXT_PUBLIC_API_BASE_URL`).

## Project layout

```
apps/web
├── eslint.config.mjs          # Flat ESLint config (next/core-web-vitals + next/typescript)
├── middleware.ts              # Edge middleware: cookie-based auth gate
├── next.config.ts             # Default NEXT_PUBLIC_* envs for local dev
├── postcss.config.mjs         # Tailwind v4 postcss pipeline
├── tsconfig.json              # `@/*` -> `./src/*`
└── src
    ├── app/                   # Next.js App Router routes
    │   ├── layout.tsx         # Root layout, wraps everything in <QueryProvider/>
    │   ├── buyer/sourcing/    # Reference page demonstrating the new template
    │   ├── ...                # Other workspace dashboards
    │   └── data/mockData.ts   # In-memory mock data used by demo workspaces
    ├── components/
    │   ├── layout/            # Shell + navigation
    │   ├── providers/         # React Query provider
    │   └── shared/            # Cross-feature UI
    ├── config/
    │   └── env.ts             # Zod-validated NEXT_PUBLIC_* envs
    ├── lib/
    │   ├── api.ts             # Thin `apiFetch` wrapper that attaches the cookie token
    │   ├── auth.ts            # Cookie-only auth session helpers + role/path routing
    │   ├── order-store.ts     # Recent purchase orders (Zustand + persist)
    │   ├── workflow-store.ts  # Demo workflow state (Zustand + persist)
    │   ├── utils.ts           # Misc helpers
    │   └── workspace-mode.ts  # `isDemoWorkspaceSession()` + slug detection
    ├── schemas/
    │   └── sourcing.ts        # Zod schemas: Product, Rfq, Quotation, inputs
    └── services/
        ├── api/sourcing.ts                       # Raw API client (no React)
        ├── queries/useSourcingQueries.ts         # React Query read hooks
        └── mutations/useSourcingMutations.ts     # React Query write hooks
```

## Architecture overview

The frontend follows a small set of patterns. The full rules are in
[README_DEVELOPMENT_GUIDELINES.md](./README_DEVELOPMENT_GUIDELINES.md);
this section is a tour of the moving parts.

### 1. Server Components by default, Client Components for interactivity

Every Next.js App Router page starts as a Server Component. Whenever a
page needs `useState`, `useEffect`, browser APIs, event handlers, or
React Query hooks, the interactive logic is extracted into a sibling
client component that opens with `"use client"`. The buyer sourcing
page is the reference template:

* `app/buyer/sourcing/page.tsx` — Server Component shell.
* `app/buyer/sourcing/components/SourcingDashboardClient.tsx` — large
  client component with the existing dashboard logic.
* `app/buyer/sourcing/components/ProductSearchTab.tsx` and
  `RfqCompareTab.tsx` — smaller client components that consume the
  new `useProducts`, `useRfqs`, `useQuotations` hooks and the
  `useSelectQuotation` mutation. They are the pattern other pages
  should migrate toward.

### 2. Repository pattern via React Query

UI components never branch on `isDemoWorkspaceSession()`. They call a
hook from `services/queries/` or `services/mutations/`. Each hook
encapsulates:

1. Demo mode → return data adapted from `app/data/mockData.ts`.
2. Real-API mode → call the typed fetcher in `services/api/sourcing.ts`,
   validate the response with the Zod schemas in `schemas/sourcing.ts`,
   and let React Query handle caching, invalidation, and refetching.

The React Query client is created once per browser session in
`components/providers/QueryProvider.tsx` and wraps the entire tree
from `app/layout.tsx`. Defaults: `staleTime: 30s`, `retry: 1`,
`refetchOnWindowFocus: false`.

### 3. Authentication via cookies only

Auth tokens are written to and read from browser cookies (via
`js-cookie`) — never `localStorage`. See `lib/auth.ts`:

* `setAuthSession(accessToken, refreshToken?)` — sets `access_token`
  and optionally `refresh_token` cookies (Path=/, SameSite=Lax,
  Secure when the page is served over HTTPS, 7-day expiry).
* `clearAuthSession()` — removes both cookies.
* `getStoredAccessToken()` / `getStoredRefreshToken()` — read helpers
  used by `lib/api.ts` to attach the `Authorization: Bearer …` header.

`middleware.ts` runs on every protected route and reads the same
cookie server-side. Demo Mode and other UI-only flags are stored
through Zustand `persist`, not in the auth cookies.

### 4. State management with Zustand + persist

Two persisted stores back the demo experience:

* `useWorkflowStore` (in `lib/workflow-store.ts`) — sourcing/RFQ/
  negotiation/orders demo state. Key: `logisync.workflow-state.v1`.
* `useRecentPurchaseOrdersStore` (in `lib/order-store.ts`) — recent
  buyer purchase orders. Key: `logisync.recent-purchase-orders.v1`.

The legacy function helpers (`loadWorkflowState`,
`updateWorkflowState`, `upsertRecentPurchaseOrder`, …) still exist as
thin wrappers over the stores, so older pages keep working while new
code can subscribe via `useWorkflowStore`/`useRecentPurchaseOrdersStore`
directly.

### 5. Validation with Zod

* `config/env.ts` parses the `NEXT_PUBLIC_*` environment variables and
  throws on startup if any are invalid.
* `schemas/sourcing.ts` defines `ProductSchema`, `RfqSchema`,
  `QuotationSchema`, and the corresponding input schemas. The API
  fetchers in `services/api/sourcing.ts` `safeParse` every response
  and silently drop items that fail validation — this is intentional
  so a single bad row from the backend doesn't break the whole page.

## Scripts

| Script                        | What it does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| `pnpm --filter @logisync/web dev`   | Next.js dev server on `:3000`                               |
| `pnpm --filter @logisync/web build` | Production build (`next build` with Turbopack)              |
| `pnpm --filter @logisync/web start` | Serve the production build                                  |
| `pnpm --filter @logisync/web lint`  | TypeScript noEmit check (the canonical "lint" for this app) |

Repo-wide:

* `pnpm lint:fast` — Biome over the whole monorepo (formatter +
  linter).
* `pnpm lint:deep` — Turbo-orchestrated `lint` script of every
  package; runs `tsc --noEmit` for `apps/web`.

## Environment variables

All variables are validated at startup by `config/env.ts`. Defaults
are baked into `next.config.ts` for local development.

| Name                                 | Default                  | Purpose                              |
| ------------------------------------ | ------------------------ | ------------------------------------ |
| `NEXT_PUBLIC_APP_ENV`                | `development`            | Free-form environment label          |
| `NEXT_PUBLIC_API_BASE_URL`           | `http://localhost:9751`  | Base URL for REST calls              |
| `NEXT_PUBLIC_WS_URL`                 | `ws://localhost:9751`    | Socket.io endpoint                   |
| `NEXT_PUBLIC_SIGNED_URL_TTL_SECONDS` | `3600`                   | Default TTL for signed media URLs    |
| `NEXT_PUBLIC_SESSION_IDLE_MINUTES`   | `30`                     | Idle timeout before re-auth          |
| `NEXT_PUBLIC_SESSION_GRACE_MINUTES`  | `5`                      | Grace window after `SESSION_IDLE`    |
| `NEXT_PUBLIC_UPLOAD_MAX_MB`          | `10`                     | Max upload size in MB                |

## What changed in the recent refactor

* The unused workspace packages `@logisync/constants`, `@logisync/session`,
  `@logisync/shared-types`, `@logisync/storage`, and `@logisync/ui` were
  deleted from the monorepo (no source code imported them).
* Auth was moved from a `localStorage` + cookie hybrid to cookies
  only (`js-cookie`).
* The buyer sourcing page was split into a Server Component shell
  plus a Client Component dashboard, and two new tab components were
  added as the canonical template for future migrations.
* `lib/workflow-store.ts` and `lib/order-store.ts` were rebuilt on
  top of Zustand `persist`, keeping their existing function APIs.
* New `schemas/sourcing.ts` (Zod) and new `services/api`,
  `services/queries`, `services/mutations` directories implement the
  repository pattern with React Query.
* The web ESLint config was migrated from `FlatCompat` to the
  native flat config exports of `eslint-config-next` v16+, and the
  `lint` script now runs `tsc --noEmit` (the previous `next lint`
  command was removed in Next.js 16).
