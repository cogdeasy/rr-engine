# Contributor guide (humans and agents)

## Layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 15 App Router console. Routes mirror `src/lib/modules.ts`. |
| `apps/api` | Fastify 5 API. Core routes in `src/routes/core.ts`, feature routes in `src/routes/`. |
| `packages/types` | Shared domain types. Add feature-specific types under `src/modules/`. |
| `packages/data` | Deterministic synthetic dataset. Add derived selectors under `src/modules/`. |
| `packages/ui` | Design system. Add feature-specific components under `src/components/modules/`. |

## Rules for feature work

1. **One module per branch.** Pick your module from `apps/web/src/lib/modules.ts` and only replace
   that module's `page.tsx` (plus files you add). Do not restyle other modules' pages.
2. **Extend, never rewrite, shared files.** In `modules.ts` flip only your own `implemented: true`.
   Barrel files under `packages/*/src/modules/index.ts` take one `export *` line per feature.
3. **API routes are tightly scoped** — one endpoint, one responsibility. Add
   `apps/api/src/routes/<module>.ts` and one registration line in `routes/modules.ts`.
4. **Use the design system.** Import from `@rr/ui`; do not hand-roll panels, tables, or charts.
   Status colour is semantic: red = act now, amber = watchlist, green = nominal, grey = no data.
5. **Data comes from `@rr/data`.** The dataset is deterministic (`generateDataset(seed)`), so the
   web app, API and tests all see identical values. Add generators rather than hardcoding rows.
6. Run `pnpm lint && pnpm typecheck && pnpm build` before opening a PR.

## Design language

Rolls-Royce aligned, dark and editorial like rolls-royce.com: the whole console sits on a
near-black navy canvas (`--color-rr-abyss`) with translucent floating panels (`.rr-panel`),
dawn-above-cloud hero surfaces (`.rr-hero-gradient`), display headlines (`.rr-display`),
generous whitespace, uppercase micro-labels, pill CTAs, restrained colour reserved for
operational state, and large numerics for the values a controller acts on. Never introduce
light surfaces: use tokens (`text-rr-ink`, `text-rr-slate`, `bg-white/[0.04]`) rather than
`bg-white` or literal hex values.

## Assets

Rolls-Royce GLB engine models are proprietary and loaded from the official CMS at runtime; never
commit them.
