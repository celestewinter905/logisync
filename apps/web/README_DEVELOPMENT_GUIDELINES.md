# Web Development Guidelines

These guidelines apply to `apps/web`. They are concrete and
prescriptive: when in doubt, follow them.

## 1. Server Components vs. Client Components

Default to **Server Components**. Only opt into `"use client"` when
the file genuinely needs:

* React state (`useState`, `useReducer`)
* Lifecycle hooks (`useEffect`, `useLayoutEffect`)
* Browser-only APIs (`window`, `document`, `localStorage`, `Cookies`)
* Event handlers (`onClick`, `onChange`, …)
* React Query, Zustand, or any other client-only library

Patterns:

* Pages (`app/**/page.tsx`) should be Server Components unless they
  contain trivial markup. Move interactive logic into a sibling
  component under `components/`.
* Keep `"use client"` files small and focused. If a client component
  exceeds ~300 lines, split it into smaller children.
* Server Components can pass plain serialisable props (strings,
  numbers, dates as ISO strings, arrays, objects) to Client
  Components, but cannot pass functions or React nodes constructed
  inside other Client Components.

Reference template: `app/buyer/sourcing/`.

## 2. Data fetching with the Repository Pattern

UI components must not know whether the workspace is in demo mode or
hitting the real API. They call a hook; the hook hides the split.

```
schemas/         <T>            ← Zod schemas (single source of truth for shapes)
services/api/    fetchFoo()     ← raw `fetch` + `safeParse`; no React
services/queries/useFoo()       ← React Query wrapper; returns demo or real data
services/mutations/useUpdateFoo() ← React Query mutation; invalidates queries
components/...   <Foo />        ← consumes the hook only
```

Rules:

* Each query hook owns its query key. Centralise the key factory in
  the same file (see `sourcingQueryKeys` in
  `services/queries/useSourcingQueries.ts`).
* The raw fetcher (`services/api/*`) is the only place that calls
  `api.get` / `api.post`. Hooks call the fetcher; components call the
  hook. This makes mocking trivial.
* Use `safeParse` (not `parse`) when validating server responses.
  Drop entries that fail validation rather than throwing — backends
  evolve, and one bad row should not nuke a page.
* Mutations must invalidate the relevant queries in `onSuccess`.
* Set a non-zero `staleTime` (default 30s) so route transitions don't
  trigger unnecessary refetches.

## 3. Global state with Zustand

Use Zustand for UI state that needs to outlive a single component
tree (e.g. demo workflow data, recently-viewed orders, sidebar
collapse state).

* Co-locate the store with the feature when possible; otherwise put
  it under `lib/`.
* Persist with the `persist` middleware and `createJSONStorage(() =>
  localStorage)`. Choose a versioned key (`logisync.foo.v1`) so we
  can bump it on schema changes.
* Define the store as plain state (`create<State>()(persist(() =>
  initial, …))`) and call `useStore.setState(next, replace?)` from
  helper functions. Avoid stuffing actions inside the state itself —
  they shadow the static `setState`/`getState` methods.
* When a hook needs both the value and the setter, subscribe via
  `useStore((state) => state.foo)` selectors so React doesn't re-run
  the component on unrelated state changes.
* Never store auth tokens in a Zustand store. Tokens belong in
  cookies (see §5).

## 4. Forms and validation with Zod

* Every form input must have a Zod schema in `schemas/<feature>.ts`.
* Use `react-hook-form` + `zodResolver` for form handling; do not
  hand-roll validation.
* Mirror the API contract: the Zod input schema for `useSubmitFoo`
  must be the same shape the backend expects, so the form, the
  mutation, and the API client all agree.
* Throw early in `config/env.ts` on missing/invalid env vars. Never
  read `process.env.X` directly outside `config/env.ts`.

## 5. Authentication

* Tokens live in cookies only — never in `localStorage`. Read/write
  via the helpers in `lib/auth.ts` (`setAuthSession`,
  `clearAuthSession`, `getStoredAccessToken`,
  `getStoredRefreshToken`).
* Cookies are `Path=/`, `SameSite=Lax`, `Secure` when the page is
  served over HTTPS, 7-day expiry. They are **not** `HttpOnly`
  because the SPA must read them to attach the `Authorization`
  header. The trade-off is acceptable for our current threat model;
  if XSS surface grows we should switch to a BFF route handler that
  proxies API calls and sets `HttpOnly` cookies on the response.
* `middleware.ts` reads the access token from cookies on the edge
  and gates protected routes. Never duplicate this check in client
  components.
* Use `lib/api.ts` (`api.get` / `api.post` / …) for all REST calls.
  It automatically attaches the bearer token from the cookie.

## 6. Folder structure

* New shared UI primitives go under `components/`.
* New feature-specific components go under `app/<route>/components/`.
* New stores go under `lib/` or co-located with the feature.
* New schemas go under `schemas/` named by feature
  (`schemas/sourcing.ts`, `schemas/orders.ts`, …).
* New API access functions go under `services/api/<feature>.ts`.
* New query hooks go under `services/queries/use<Feature>Queries.ts`.
* New mutation hooks go under
  `services/mutations/use<Feature>Mutations.ts`.

## 7. Imports

* Use the `@/*` path alias for anything under `apps/web/src`.
* Import order: external packages → workspace packages → `@/*`
  aliases → relative imports. Biome enforces this automatically.
* Never import from `app/data/mockData.ts` outside of `lib/` and
  `services/queries/`. UI components must go through the hooks.

## 8. Comments and naming

* No comments by default. Names should explain intent; comments
  should explain *why*, never *what*. Mirror the surrounding style.
* All new comments, identifiers, README sections, and PR
  descriptions are written in English.
* For exported functions, prefer verb-first naming
  (`fetchProducts`, `useProducts`, `selectQuotation`).

## 9. Testing

* Build sanity: `pnpm --filter @logisync/web build`.
* Type check: `pnpm --filter @logisync/web lint` (runs
  `tsc --noEmit`).
* Repo-wide lint: `pnpm lint:fast` (Biome) and `pnpm lint:deep`
  (Turbo orchestrated per-package lint).
* When adding a new query/mutation hook, add an explicit demo path
  and an explicit real-API path even if the demo path returns an
  empty array — the dual signature is the contract.

## 10. Things to avoid

* `localStorage.getItem('access_token')` and friends. Use the
  cookie helpers.
* `useEffect` chains that fetch data. Use React Query.
* `any` in component props or React Query return types. Either use
  the Zod-inferred type or define a narrow union.
* Mixing demo and real-API code inside a component. Push the split
  down into the query hook.
* Editing `app/data/mockData.ts` for one-off demo tweaks. Add a new
  mock value next to the feature instead.
