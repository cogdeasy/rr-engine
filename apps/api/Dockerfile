# Build context is the monorepo root: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/data/package.json packages/data/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @rr/api...

FROM deps AS runner
COPY packages packages
COPY apps/api apps/api
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@rr/api", "start"]
