// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import multer, { MulterError } from "multer";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { ProductMediaController } from "../controllers/product-media.controller";

export function createProductMediaRouter(
  controller: ProductMediaController,
  authenticate: RequestHandler,
  maximumBytes: number,
): Router {
  const router = Router();
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maximumBytes, files: 1 },
  }).single("file");
  const parseUpload: RequestHandler = (request, response, next) => {
    parser(request, response, (error) => {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        next(new ApplicationError(413, "MEDIA_TOO_LARGE", "Product media exceeds the upload limit"));
        return;
      }
      next(error);
    });
  };

  const authorize = [authenticate, requireStaffRole("administrator", "catalog_manager")] as const;
  router.post("/products/:productId/media", ...authorize, parseUpload, controller.upload);
  router.patch("/products/:productId/media/:mediaId", ...authorize, controller.update);
  router.delete("/products/:productId/media/:mediaId", ...authorize, controller.delete);
  router.get("/products/:productId/media/:mediaId/content", ...authorize, controller.content);
  return router;
}
