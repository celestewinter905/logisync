# LogiSync — Multi-tenant Logistics Platform

LogiSync is a monorepo (Turborepo + pnpm workspaces) that hosts the
LogiSync API, web app, and mobile app from a single source tree.

## Quick start

### 1. Install

```bash
pnpm install
pnpm prepare
```

### 2. Database & infrastructure

```bash
pnpm db:setup:local
pnpm db:studio
```

### 3. Development

```bash
pnpm dev           # All services in parallel
pnpm dev:api       # NestJS backend only
pnpm dev:web       # Next.js frontend only
pnpm dev:mobile    # React Native (Expo) only
```

### 4. Verify the install

```bash
curl http://localhost:3000/health/ready
curl http://localhost:3000/health
```

## Repository layout

```
.
├── apps/
│   ├── api/          NestJS backend
│   ├── web/          Next.js frontend (App Router)
│   └── mobile/       Expo / React Native client
├── packages/
│   └── api-client/   Tiny shared `apiFetch` helper used by web and mobile
├── docs/             Per-app and architecture documentation
└── turbo.json        Task pipeline definitions
```

The `packages/` directory previously contained `constants`, `session`,
`shared-types`, `storage`, and `ui` — all unused workspace packages.
They were removed in the web refactor; consult git history if they
need to be restored.

## Commit convention

Always use `pnpm commit` to produce a Commitizen-formatted message:

```bash
pnpm commit
```

### Format

```
<type>(<scope>): <subject>
```

* **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `chore`, `ci`.
* **Scopes**: `api`, `web`, `mobile`, `db`, `auth`, `validation`,
  `config`, …

### Examples

```
feat(auth): add OAuth2 support
fix(validation): handle null values in schemas
docs(api): update validation guide
```

### Rules

* Imperative mood ("add", not "added").
* No trailing period.
* Subject ≤ 50 characters.
* Reference issues with `Closes #123`.

## Key features

* Multi-tenant workspace model (supplier / buyer / carrier).
* Product & order management.
* Real-time GPS tracking and ETA.
* e-POD (electronic proof of delivery).
* Invoice and payment management.
* Append-only, tamper-proof audit logging.
* Security stack: RBAC, bcrypt, Postgres row-level security, JWT.
* Health checks and background workers (scheduled tasks).

## Documentation

* [`docs/README.md`](./docs/README.md) — top-level documentation hub.
* [`docs/api/README.md`](./docs/api/README.md) — backend.
* [`docs/web/README.md`](./docs/web/README.md) — frontend.
* [`docs/mobile/README.md`](./docs/mobile/README.md) — mobile.
* [`apps/web/README.md`](./apps/web/README.md) — web app layout and
  architecture overview.
* [`apps/web/README_DEVELOPMENT_GUIDELINES.md`](./apps/web/README_DEVELOPMENT_GUIDELINES.md)
  — Server vs. Client components, React Query, Zustand, Zod, auth.
