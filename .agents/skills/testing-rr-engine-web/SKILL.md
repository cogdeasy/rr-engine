---
name: testing-rr-engine-web
description: How to run and end-to-end test the rr-engine monorepo (Next.js 15 web + Fastify API) locally, including dev-server gotchas, API base URL, and deterministic dataset facts.
---

# Testing the rr-engine console locally

## Bring the stack up

```bash
cd <repo>            # e.g. /home/ubuntu/repos/rr-engine
pnpm install         # needs `pnpm config set dangerouslyAllowAllBuilds true --location=user`
pnpm dev             # turbo --parallel: web on :3000, api on :4000
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000` with route **prefix `/api`** (`apps/api/src/index.ts`,
  `apps/api/src/server.ts`). Do not assume :3001 or an unprefixed path.
- You can also start just one app: `cd apps/web && pnpm dev` / `cd apps/api && pnpm dev`.
  If a full `pnpm dev` logs `EADDRINUSE` on 4000, an API is already running — that is fine.

## Dev-server gotcha: stale `.next` chunks (seen repeatedly)

Symptoms (may appear at any time, including mid-session after many HMR cycles):
- Page HTML is 200 but renders **unstyled**; `/_next/static/css/app/layout.css` and
  `/_next/static/chunks/*.js` return 404.
- Runtime overlay `Cannot find module './3569.js'` with a `.next/server/...` require stack.

This is an environment/dev-server issue, not necessarily a code regression. Verify before
reporting a bug:

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/_next/static/css/app/layout.css
pkill -f "turbo run dev"; pkill -f "next dev"; pkill -f next-server
rm -rf apps/web/.next
cd apps/web && pnpm dev
```

Re-test the page after the clean restart; if it renders, the failure was stale build state.

## Headless browser checks

`playwright-core` is installed; use the system Chrome:

```js
const b = await chromium.launch({ executablePath: '/home/ubuntu/.local/bin/google-chrome',
                                  args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
```

Attach `page.on('console')` / `page.on('pageerror')` listeners and assert zero
errors/warnings (this also catches React hydration warnings).

## Deterministic dataset

`@rr/data` is seeded (`generateDataset(seed)`), so web, API and tests agree. Useful for
cross-checking UI numbers against the API, e.g. for the task-cards module:

```bash
curl -s "localhost:4000/api/task-cards/execution" | jq '.summary'
curl -s "localhost:4000/api/task-cards/execution?state=blocked" | jq '.cards | length'
curl -s "localhost:4000/api/task-cards/TC-0001/execution" | jq '.reference'
```

Facility ids are `FC-000N` (not the ICAO shown in the UI); map ICAO → id from the
`cards[].facilityId` / `facilityIcao` fields before filtering by query string.

## UI conventions worth knowing when testing

- Tables come from `@rr/ui` `DataTable`: clicking a column header sorts **descending first**,
  clicking the same header again toggles to ascending.
- Module pages that are not implemented render an "In build" placeholder — that is expected,
  not a regression.
- Timestamps are rendered relative to the synthetic dataset clock, which can be **ahead of real
  time**; freshly created client-side entries may therefore show negative ages like `-261m ago`.
  Check whether this is pre-existing before reporting it as a new bug.

## Devin Secrets Needed

None — everything runs locally with synthetic data and no authentication.
