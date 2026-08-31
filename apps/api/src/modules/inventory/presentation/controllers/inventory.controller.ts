// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { InventoryDomainError } from "../../domain/exceptions/inventory-domain.error";
import { InventoryApplicationError } from "../../application/services/inventory-application.error";
import type { InventoryServiceContract } from "../../application/services/interfaces/inventory.service";
import type { InventoryStaffRole } from "../../application/dtos/inventory.dto";
import {
  parseAdjustment,
  parseInventoryId,
  parseInventoryList,
  parseMovementQuery,
  parseReceipt,
} from "../validators/inventory.validator";

export class InventoryController {
  constructor(
    private readonly service: InventoryServiceContract,
    private readonly aiOperations?: {
      generateOperationsProposal: (req: { prompt: string }) => Promise<any>;
      getProposalDocx: (id: string) => { buffer: Buffer; filename: string; mediaType: string };
      applyOperationsProposal: (id: string, req: { items: any[] }) => Promise<any>;
    },
  ) {}

  readonly list: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.list(parseInventoryList(request.query));
      response.json(successResponse("Inventory retrieved", result.items, pagination(result)));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly get: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Inventory item retrieved", await this.service.get(parseInventoryId(request.params.inventoryItemId))));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly receive: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.receive(parseReceipt(request.body), context(response.locals));
      response.status(201).json(successResponse("Stock received", result));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly adjust: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.adjust(
        parseInventoryId(request.params.inventoryItemId),
        parseAdjustment(request.body),
        context(response.locals),
      );
      response.json(successResponse("Stock adjusted", result));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly movements: RequestHandler = async (request, response, next) => {
    try {
      const query = parseMovementQuery(request.query);
      const result = await this.service.listMovements(
        parseInventoryId(request.params.inventoryItemId),
        query.page,
        query.pageSize,
      );
      response.json(successResponse("Stock movements retrieved", result.items, pagination(result)));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly generateAiProposal: RequestHandler = async (request, response, next) => {
    try {
      if (!this.aiOperations) {
        throw new ApplicationError(500, "AI_OPERATIONS_UNAVAILABLE", "AI Operations service is not configured");
      }
      const prompt = typeof request.body?.prompt === "string" ? request.body.prompt : "";
      const proposal = await this.aiOperations.generateOperationsProposal({ prompt });
      response.json(successResponse("AI Operations proposal generated", proposal));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly getAiProposalDocx: RequestHandler = async (request, response, next) => {
    try {
      if (!this.aiOperations) {
        throw new ApplicationError(500, "AI_OPERATIONS_UNAVAILABLE", "AI Operations service is not configured");
      }
      const proposalId = request.params.proposalId as string;
      const file = this.aiOperations.getProposalDocx(proposalId);
      response.setHeader("Content-Type", file.mediaType);
      response.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      response.setHeader("Content-Length", file.buffer.length);
      response.status(200).send(file.buffer);
    } catch (error) { next(toHttpError(error)); }
  };

  readonly applyAiProposal: RequestHandler = async (request, response, next) => {
    try {
      if (!this.aiOperations) {
        throw new ApplicationError(500, "AI_OPERATIONS_UNAVAILABLE", "AI Operations service is not configured");
      }
      const proposalId = request.params.proposalId as string;
      const items = Array.isArray(request.body?.items) ? request.body.items : [];
      const result = await this.aiOperations.applyOperationsProposal(proposalId, { items });
      response.json(successResponse("AI Operations proposal applied", result));
    } catch (error) { next(toHttpError(error)); }
  };
}

function context(locals: Record<string, unknown>) {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return {
    actorId: principal.subject,
    roles: principal.roles.filter(isInventoryRole),
    correlationId: locals.correlationId as string,
  };
}

function isInventoryRole(role: StaffPrincipal["roles"][number]): role is InventoryStaffRole {
  return role === "administrator" || role === "catalog_manager" || role === "inventory_manager";
}

function pagination(result: { page: number; pageSize: number; totalItems: number; totalPages: number }) {
  return { page: result.page, pageSize: result.pageSize, totalItems: result.totalItems, totalPages: result.totalPages };
}

function toHttpError(error: unknown): unknown {
  if (error instanceof InventoryDomainError) {
    return new ApplicationError(409, error.code, error.message);
  }
  if (!(error instanceof InventoryApplicationError)) return error;
  const status = error.code === "INVENTORY_ITEM_NOT_FOUND" || error.code === "VARIANT_NOT_FOUND" || error.code === "RESERVATION_NOT_FOUND"
    ? 404
    : error.code === "FORBIDDEN" ? 403 : 409;
  return new ApplicationError(status, error.code, error.message);
}
