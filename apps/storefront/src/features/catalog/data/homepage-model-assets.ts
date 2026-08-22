// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { HomepageModelAsset } from "../types/homepage-experience.types";

export const homepageModelAssets = [
  {
    id: "smartphone",
    path: "/models/homepage/smartphone.glb",
    sourceUrl: "https://poly.pizza/m/4DRZmTs3jq",
    license: "CC0-1.0",
    creator: "smallbigsquare",
    sha256: "868e2d7b191defae7b7c8e2908d3cd41d1c7be1a940945737010590e89b35e90",
  },
  {
    id: "laptop",
    path: "/models/homepage/laptop.glb",
    sourceUrl: "https://poly.pizza/m/GnbwSUiVty",
    license: "CC0-1.0",
    creator: "Kenney",
    sha256: "387328b3c6530213770fb579545fa8cc27cc4ee6cf710f3f01bb28873da99b5e",
  },
  {
    id: "headphones",
    path: "/models/homepage/headphones.glb",
    sourceUrl: "https://poly.pizza/m/PSsWSIAYIL",
    license: "CC0-1.0",
    creator: "CreativeTrio",
    sha256: "8b34489472f7c23795d9e286ade2996c7f7e602f643a58ef3af20dbe4d73e75c",
  },
  {
    id: "game-controller",
    path: "/models/homepage/game-controller.glb",
    sourceUrl: "https://poly.pizza/m/8QtaCh2s3sm",
    license: "CC-BY-3.0",
    creator: "Paul Spooner",
    sha256: "28147ad3bdcc1dbb447d7b55439159069425383b866df399acf68f98b8bf0e54",
  },
] as const satisfies readonly HomepageModelAsset[];
