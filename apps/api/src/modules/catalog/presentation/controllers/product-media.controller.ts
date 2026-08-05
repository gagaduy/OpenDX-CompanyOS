// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { ProductMediaResponseDto } from "../../application/dtos/responses/media-response.dto";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { ProductMediaServiceContract } from "../../application/services/interfaces/product-media.service";
import type { ProductMedia } from "../../domain/entities/product-media";
import {
  parseMediaId,
  parseMediaUpdate,
  parseMediaUploadFields,
} from "../validators/media.validator";

export class ProductMediaController {
  constructor(private readonly service: ProductMediaServiceContract) {}

  readonly upload: RequestHandler = async (request, response, next) => {
    try {
      if (request.file === undefined) {
        throw new ApplicationError(400, "VALIDATION_ERROR", "Product media file is required");
      }
      const productId = parseMediaId(request.params.productId);
      const fields = parseMediaUploadFields(request.body);
      const media = await this.service.upload(
        productId,
        {
          bytes: request.file.buffer,
          suppliedContentType: request.file.mimetype,
          ...fields,
        },
        context(response.locals),
      );
      response.status(201).json(successResponse("Product media uploaded", toResponse(media)));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly update: RequestHandler = async (request, response, next) => {
    try {
      const media = await this.service.update(
        parseMediaId(request.params.productId),
        parseMediaId(request.params.mediaId),
        parseMediaUpdate(request.body),
        context(response.locals),
      );
      response.json(successResponse("Product media updated", toResponse(media)));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly delete: RequestHandler = async (request, response, next) => {
    try {
      await this.service.delete(
        parseMediaId(request.params.productId),
        parseMediaId(request.params.mediaId),
        context(response.locals),
      );
      response.status(204).send();
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly content: RequestHandler = async (request, response, next) => {
    try {
      const content = await this.service.getContent(
        parseMediaId(request.params.productId),
        parseMediaId(request.params.mediaId),
      );
      response.type(content.contentType).send(Buffer.from(content.bytes));
    } catch (error) {
      next(toHttpError(error));
    }
  };
}

function toResponse(media: ProductMedia): ProductMediaResponseDto {
  return {
    id: media.id,
    productId: media.productId,
    contentType: media.contentType,
    byteSize: media.byteSize,
    altText: media.altText,
    sortOrder: media.sortOrder,
    isPrimary: media.isPrimary,
    previewUrl: `/v1/admin/catalog/products/${media.productId}/media/${media.id}/content`,
    createdAt: media.createdAt,
  };
}

function context(locals: Record<string, unknown>) {
  return {
    actorId: (locals.staffPrincipal as StaffPrincipal).subject,
    correlationId: locals.correlationId as string,
  };
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND"
    ? 404
    : error.code === "UNSUPPORTED_MEDIA_TYPE"
      ? 415
      : error.code === "MEDIA_TOO_LARGE"
        ? 413
        : error.code === "VALIDATION_ERROR"
          ? 400
          : 409;
  return new ApplicationError(status, error.code, error.message);
}
