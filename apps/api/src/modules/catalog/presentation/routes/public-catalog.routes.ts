// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { PublicCatalogController } from "../controllers/public-catalog.controller";

export function createPublicCatalogRouter(controller: PublicCatalogController): Router {
  const router = Router();
  router.get("/categories", controller.categories);
  router.get("/products", controller.products);
  router.get("/products/:productId/media/:mediaId/content", controller.media);
  router.get("/products/:slug", controller.product);
  return router;
}
