# RR Engine — Engine Health & MRO Operations Platform

A Rolls-Royce design-aligned operations platform for engine health monitoring, prognostics and
MRO execution. Built as a pnpm + Turborepo monorepo.

```
apps/
  web/     Next.js 15 (App Router) operations console
  api/     Fastify 5 read API over the synthetic fleet dataset
packages/
  types/   Shared domain contracts (@rr/types)
  data/    Deterministic synthetic fleet data engine (@rr/data)
  ui/      Rolls-Royce design system + charts (@rr/ui)
```

## Getting started

```bash
pnpm install
pnpm dev            # web on :3000, api on :4000
pnpm lint && pnpm typecheck && pnpm build
```

## Hosting

Both apps ship as containers built from the monorepo root.

```bash
docker compose up --build        # console on :3000, api on :4000
```

Or build them individually:

```bash
docker build -f apps/web/Dockerfile -t rr-engine-web .
docker build -f apps/api/Dockerfile -t rr-engine-api .
```

`render.yaml` is a Render blueprint for the same two services; any Docker host (Fly, Cloud Run,
ECS, Kubernetes) works the same way.

| Service | Variable | Default | Notes |
| --- | --- | --- | --- |
| api | `PORT` / `HOST` | `4000` / `0.0.0.0` | |
| api | `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated console origins. Set to the deployed console URL. |
| api | `LOG_LEVEL` | `info` | |
| web | `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | |

The console renders from `@rr/data` server-side, so it runs without the API; the API is the
read surface for external consumers.

Before hosting anywhere public, note the engine-asset licensing below — the twin pulls
Rolls-Royce GLBs from their CMS at runtime.

## 3D engine assets

The engine twin loads official Rolls-Royce Discover Engines GLB models from
`engines-cms.rolls-royce.com` at runtime. They are **not** vendored: the Discover Engines
disclaimer states the content is Rolls-Royce property and may not be copied by a third party or
used for any purpose other than that intended by Rolls-Royce plc. Written permission is required
before any public or commercial reuse.

For offline development, cache them locally (gitignored):

```bash
node scripts/fetch-models.mjs
```

## Conventions

See `AGENTS.md` for the module registry, route ownership and contribution rules.
