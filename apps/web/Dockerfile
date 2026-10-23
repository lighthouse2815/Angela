FROM node:24-trixie AS build-stage

WORKDIR /app

ARG VITE_ENABLE_ANALYTICS=false
ENV VITE_ENABLE_ANALYTICS=${VITE_ENABLE_ANALYTICS}

RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y build-essential python3 python3-setuptools curl

RUN corepack enable

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

RUN pnpm -F @angela/web run build && \
    ./scripts/build-airi-docs.sh ./apps/web/dist/docs && \
    pnpm -F @angela/stage-ui run story:build && \
    mv ./shared/ui/stage/.histoire/dist ./apps/web/dist/ui

FROM nginx:stable-alpine AS production-stage

COPY --from=build-stage /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
