# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack install --global pnpm@11.17.0

FROM workspace AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/site/package.json apps/site/package.json
COPY packages/browser-renderer/package.json packages/browser-renderer/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/gateway/package.json packages/gateway/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/runtime/model-project/package.json packages/runtime/model-project/package.json
COPY packages/renderer/package.json packages/renderer/package.json
COPY packages/runtime/package.json packages/runtime/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
# The template identity check uses Git metadata, which is excluded from images.
# Run the full pnpm verify in the checkout before release.
RUN pnpm test:codex-installer \
  && pnpm check:boundaries \
  && pnpm test:boundaries \
  && pnpm lint \
  && pnpm typecheck \
  && pnpm test \
  && pnpm build \
  && pnpm check:boundaries
RUN mkdir -p apps/site/.next/standalone/apps/site/.next \
  && cp -R apps/site/.next/static apps/site/.next/standalone/apps/site/.next/static \
  && cp -R apps/site/public apps/site/.next/standalone/apps/site/public

# Operator image: contains Drizzle migrations, pnpm, and provisioning commands.
FROM build AS tooling
ENV NODE_ENV=production
CMD ["pnpm", "db:migrate"]

FROM node:22-bookworm-slim AS runtime
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /workspace/apps/site/.next/standalone/ ./
RUN mkdir -p /var/lib/theoryfoundry/exports \
  && chown nextjs:nodejs /var/lib/theoryfoundry/exports
USER nextjs
EXPOSE 3000
CMD ["node", "apps/site/server.js"]
