FROM node:24-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY backend/api backend/api
COPY backend/contracts/auth backend/contracts/auth
COPY backend/contracts/api backend/contracts/api

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @angela/server-sdk-shared run build
RUN pnpm -F @angela/api-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@angela/api-server", "start"]
