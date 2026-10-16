FROM node:24-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY dev-infuture/catalog.yaml dev-infuture/catalog.yaml
COPY dev-infuture/server/apps/auth dev-infuture/server/apps/auth
COPY server/packages/auth-shared server/packages/auth-shared

RUN sed -i '/^catalog:/r dev-infuture/catalog.yaml' pnpm-workspace.yaml \
    && sed -i '/!dev-infuture/d' pnpm-workspace.yaml \
    && sed -i '/^packages:/a\  - dev-infuture/server/apps/auth' pnpm-workspace.yaml \
    && pnpm install --no-frozen-lockfile --ignore-scripts --filter @proj-airi/auth-server...

RUN pnpm -F @proj-airi/auth-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@proj-airi/auth-server", "start"]
