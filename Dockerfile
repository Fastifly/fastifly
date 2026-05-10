# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/authz/package.json packages/authz/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm build

FROM builder AS migrations
CMD ["pnpm", "db:migrate:sqlite"]

FROM builder AS prod-deps
RUN pnpm --filter @fastifly/api deploy --prod --legacy /prod/api

FROM base AS production
ENV APP_ENV=production
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV APP_PORT=3000

COPY --from=prod-deps --chown=node:node /prod/api ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.APP_PORT || '3000') + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
