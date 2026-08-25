// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { ProductImageContentType, ProductMedia } from "../../../domain/entities/product-media";
import { assertProductMutable } from "../../../domain/services/catalog-rules";
import type {
  UpdateProductMediaRequestDto,
  UploadProductMediaRequestDto,
} from "../../dtos/requests/media-request.dto";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { ProductMediaRepository } from "../../repositories/interfaces/product-media.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import type { ProductMediaInspector, ProductMediaStorage } from "../../storage/product-media.storage";
import { CatalogApplicationError } from "../catalog-application.error";
import type { CatalogCommandContext } from "../interfaces/category.service";
import type { ProductMediaServiceContract } from "../interfaces/product-media.service";

export class ProductMediaService implements ProductMediaServiceContract {
  constructor(
    private readonly repository: ProductMediaRepository,
    private readonly products: ProductRepository,
    private readonly storage: ProductMediaStorage,
    private readonly inspector: ProductMediaInspector,
    private readonly audit: CatalogAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly maximumBytes: number,
  ) {}

  async list(productId: string): Promise<readonly ProductMedia[]> {
    return this.transactions.runReadOnly(async (session) => {
      await this.requireProduct(session, productId, false);
      return this.repository.listByProduct(session, productId);
    });
  }

  async upload(productId: string, request: UploadProductMediaRequestDto, context: CatalogCommandContext): Promise<ProductMedia> {
    const altText = request.altText.trim();
    if (altText.length === 0) throw validation("Media alt text is required");
    if (request.sortOrder < 0 || !Number.isSafeInteger(request.sortOrder)) throw validation("Media sort order is invalid");
    if (request.bytes.byteLength > this.maximumBytes) {
      throw new CatalogApplicationError("MEDIA_TOO_LARGE", "Product media exceeds the upload limit");
    }
    const contentType = await this.inspector.detectContentType(request.bytes);
    if (contentType === undefined) {
      throw new CatalogApplicationError("UNSUPPORTED_MEDIA_TYPE", "Unsupported product media type");
    }
    await this.transactions.runReadOnly((session) => this.requireProduct(session, productId, true));
    const id = this.generateId();
    const objectKey = `products/${productId}/${id}.${extension(contentType)}`;
    const media: ProductMedia = {
      id,
      productId,
      objectKey,
      contentType,
      byteSize: request.bytes.byteLength,
      altText,
      sortOrder: request.sortOrder,
      isPrimary: request.isPrimary,
      createdAt: this.now(),
    };

    await this.storage.upload(objectKey, request.bytes, contentType);
    try {
      await this.transactions.run(async (session) => {
        await this.requireProduct(session, productId, true);
        await this.repository.create(session, media);
        await this.appendAudit(session, media, "catalog.media.created", context);
      });
    } catch (error) {
      await this.storage.delete(objectKey);
      throw error;
    }
    return structuredClone(media);
  }

  async update(
    productId: string,
    mediaId: string,
    request: UpdateProductMediaRequestDto,
    context: CatalogCommandContext,
  ): Promise<ProductMedia> {
    return this.transactions.run(async (session) => {
      await this.requireProduct(session, productId, true);
      const current = await this.requireMedia(session, productId, mediaId);
      const altText = request.altText?.trim() ?? current.altText;
      if (altText.length === 0) throw validation("Media alt text is required");
      const sortOrder = request.sortOrder ?? current.sortOrder;
      if (sortOrder < 0 || !Number.isSafeInteger(sortOrder)) throw validation("Media sort order is invalid");
      const updated: ProductMedia = {
        ...current,
        altText,
        sortOrder,
        isPrimary: request.isPrimary ?? current.isPrimary,
      };
      if (!(await this.repository.update(session, updated))) {
        throw new CatalogApplicationError("NOT_FOUND", "Product media not found");
      }
      await this.appendAudit(session, updated, "catalog.media.updated", context);
      return structuredClone(updated);
    });
  }

  async delete(productId: string, mediaId: string, context: CatalogCommandContext): Promise<void> {
    const deleted = await this.transactions.run(async (session) => {
      await this.requireProduct(session, productId, true);
      const media = await this.repository.findById(session, mediaId);
      if (media === undefined || media.productId !== productId) return undefined;
      await this.repository.delete(session, mediaId);
      await this.appendAudit(session, media, "catalog.media.deleted", context);
      return media;
    });
    if (deleted !== undefined) await this.storage.delete(deleted.objectKey);
  }

  async getContent(productId: string, mediaId: string) {
    const media = await this.transactions.runReadOnly((session) =>
      this.requireMedia(session, productId, mediaId),
    );
    return { bytes: await this.storage.get(media.objectKey), contentType: media.contentType };
  }

  private async requireProduct(session: DatabaseSession, id: string, mutable: boolean): Promise<void> {
    const product = await this.products.findById(session, id);
    if (product === undefined) throw new CatalogApplicationError("NOT_FOUND", "Product not found");
    if (mutable) assertProductMutable(product.status);
  }

  private async requireMedia(session: DatabaseSession, productId: string, id: string): Promise<ProductMedia> {
    const media = await this.repository.findById(session, id);
    if (media === undefined || media.productId !== productId) {
      throw new CatalogApplicationError("NOT_FOUND", "Product media not found");
    }
    return media;
  }

  private async appendAudit(
    session: DatabaseSession,
    media: ProductMedia,
    action: string,
    context: CatalogCommandContext,
  ): Promise<void> {
    await this.audit.append(session, {
      id: this.generateId(),
      actorId: context.actorId,
      action,
      resourceType: "media",
      resourceId: media.id,
      outcome: "success",
      correlationId: context.correlationId,
      metadata: { contentType: media.contentType, byteSize: media.byteSize },
      occurredAt: this.now(),
    });
  }
}

function extension(contentType: ProductImageContentType): string {
  return contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length);
}

function validation(message: string): CatalogApplicationError {
  return new CatalogApplicationError("VALIDATION_ERROR", message);
}
