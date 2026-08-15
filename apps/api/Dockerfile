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

FROM base AS production
RUN pnpm --filter @opendx/api typecheck \
  && pnpm --filter @opendx/api exec esbuild src/server.ts --bundle \
    --platform=node --format=esm --packages=external --outfile=dist/server.mjs
EXPOSE 4000
CMD ["node", "dist/server.mjs"]

FROM base AS development
EXPOSE 4000
CMD ["pnpm", "--filter", "@opendx/api", "dev"]
