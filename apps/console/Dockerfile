# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV CI=true
WORKDIR /workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.18.0 --activate \
  && mkdir -p /pnpm \
  && chown node:node /pnpm /workspace
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG VITE_API_BASE_URL
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ARG VITE_OIDC_POST_LOGOUT_REDIRECT_URI
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
  VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY \
  VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
  VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI \
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI=$VITE_OIDC_POST_LOGOUT_REDIRECT_URI
RUN pnpm --filter @opendx/console build

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS production
ENV PORT=3000
ENV XDG_CONFIG_HOME=/tmp
ENV XDG_DATA_HOME=/tmp
RUN setcap -r /usr/bin/caddy
COPY infra/deploy/Caddyfile.spa /etc/caddy/Caddyfile
COPY --from=build --chown=10001:10001 /workspace/apps/console/dist /srv
USER 10001:10001
EXPOSE 3000
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]

FROM base AS development
EXPOSE 3000
CMD ["pnpm", "--filter", "@opendx/console", "dev", "--host", "0.0.0.0"]
