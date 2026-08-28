// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { MarketingController } from "../presentation/controllers/marketing.controller";
import { createMarketingAdminRouter } from "../presentation/routes/marketing.routes";
import type { IMarketingCampaignService } from "../application/services/interfaces/marketing-campaign.service";
import type {
  MarketingCampaignDetailResponseDto,
  MarketingCampaignListResponseDto,
  MarketingCampaignResponseDto,
} from "../application/dtos/marketing.dto";
import { MarketingApplicationError } from "../presentation/middleware/marketing-error.middleware";

function createTestApp(
  service: IMarketingCampaignService,
  roles: StaffRole[] = ["agentic_operator"],
  subject = "staff-operator-1",
) {
  const app = express();
  app.use(express.json());

  const tokenVerifier = {
    async verify() {
      return {
        sub: subject,
        name: "Test Staff",
        realm_access: { roles },
      };
    },
  };

  const controller = new MarketingController(service);
  const router = createMarketingAdminRouter({
    controller,
    staffTokenVerifier: tokenVerifier,
  });

  app.use("/v1/admin/marketing", router);
  app.use(createErrorHandler());

  return app;
}

describe("Marketing Admin API", () => {
  const sampleCampaignDto: MarketingCampaignResponseDto = {
    id: "00000000-0000-4000-8000-000000000001",
    state: "draft",
    assignmentMode: "direct_department",
    createdBy: "staff-operator-1",
    idempotencyKey: "test-idemp-1",
    sourceTaskId: null,
    version: 1,
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
  };

  const sampleDetailDto: MarketingCampaignDetailResponseDto = {
    campaign: sampleCampaignDto,
    brief: {
      id: "00000000-0000-4000-8000-000000000002",
      campaignId: sampleCampaignDto.id,
      campaignName: "Promo Campaign",
      objective: "Drive Awareness",
      subjectKind: "catalog_product",
      subjectReference: "prod-1",
      audience: "Everyone",
      language: "vi",
      tone: "Friendly",
      mandatoryMessage: "Check it out",
      prohibitedClaims: [],
      callToAction: "Shop now",
      facebookPageConfigurationId: "fb-page-1",
      scheduledFor: "2026-08-30T10:00:00.000Z",
      deadline: "2026-08-30T18:00:00.000Z",
      approverId: "approver-1",
      maximumCostMicros: 500000,
      provenance: [],
      version: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
    },
    contentVersions: [],
    visualAssets: [],
    publicationPackages: [],
    currentPackage: null,
    publicationAttempts: [],
    publicationRecord: null,
    artifacts: [],
  };

  const sampleListDto: MarketingCampaignListResponseDto = {
    items: [sampleCampaignDto],
    total: 1,
  };

  const validPayload = {
    assignmentMode: "direct_department",
    campaignName: "NovaPhone 15 Launch",
    objective: "Highlight flagship features",
    subject: { kind: "catalog_product", reference: "novaphone-15" },
    language: "vi",
    mandatoryMessage: "Order now for bonus gifts",
    prohibitedClaims: [],
    callToAction: "Pre-order at NovaCommerce Store",
    facebookPageConfigurationId: "page-cfg-primary",
    scheduledFor: "2026-08-30T10:00:00.000Z",
    deadline: "2026-08-30T18:00:00.000Z",
    approverId: "staff-approver-1",
    maximumCostMicros: 500000,
    provenance: [],
  };

  it("POST /campaigns returns 201 when authenticated as operator with valid payload and idempotency key", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn().mockResolvedValue(sampleCampaignDto),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_operator"]);

    const response = await request(app)
      .post("/v1/admin/marketing/campaigns")
      .set("Authorization", "Bearer valid-token")
      .set("Idempotency-Key", "test-idemp-1")
      .send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(sampleCampaignDto);
    expect(mockService.createCampaign).toHaveBeenCalledWith("staff-operator-1", {
      ...validPayload,
      idempotencyKey: "test-idemp-1",
    });
  });

  it("POST /campaigns returns 401 when Authorization header is missing", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_operator"]);

    const response = await request(app)
      .post("/v1/admin/marketing/campaigns")
      .set("Idempotency-Key", "test-idemp-1")
      .send(validPayload);

    expect(response.status).toBe(401);
  });

  it("POST /campaigns returns 403 when role is unauthorized (e.g. catalog_manager)", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["catalog_manager"]);

    const response = await request(app)
      .post("/v1/admin/marketing/campaigns")
      .set("Authorization", "Bearer valid-token")
      .set("Idempotency-Key", "test-idemp-1")
      .send(validPayload);

    expect(response.status).toBe(403);
  });

  it("POST /campaigns returns 400 when Idempotency-Key is missing", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_operator"]);

    const response = await request(app)
      .post("/v1/admin/marketing/campaigns")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("POST /campaigns returns 400 on OUT_OF_DEPARTMENT_SCOPE error", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn().mockRejectedValue(
        MarketingApplicationError.outOfScope("Paid ads not supported"),
      ),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_operator"]);

    const response = await request(app)
      .post("/v1/admin/marketing/campaigns")
      .set("Authorization", "Bearer valid-token")
      .set("Idempotency-Key", "test-idemp-1")
      .send(validPayload);

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("OUT_OF_DEPARTMENT_SCOPE");
  });

  it("GET /campaigns returns 200 with campaign list", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn().mockResolvedValue(sampleListDto),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_auditor"]);

    const response = await request(app)
      .get("/v1/admin/marketing/campaigns")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(sampleListDto);
  });

  it("GET /campaigns/:campaignId returns 200 with campaign detail", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn().mockResolvedValue(sampleDetailDto),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_approver"]);

    const response = await request(app)
      .get(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}`)
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(sampleDetailDto);
  });

  it("POST /campaigns/:campaignId/ready transitions campaign to validating", async () => {
    const readyDto = { ...sampleCampaignDto, state: "validating" as const, version: 2 };
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn().mockResolvedValue(readyDto),
      cancelCampaign: vi.fn(),
    };

    const app = createTestApp(mockService, ["agentic_operator"]);

    const response = await request(app)
      .post(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}/ready`)
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("validating");
  });

  it("POST /campaigns/:campaignId/cancel cancels the campaign", async () => {
    const canceledDto = { ...sampleCampaignDto, state: "canceled" as const, version: 2 };
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn().mockResolvedValue(canceledDto),
    };

    const app = createTestApp(mockService, ["agentic_operator"]);

    const response = await request(app)
      .post(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}/cancel`)
      .set("Authorization", "Bearer valid-token")
      .send({ reason: "User request" });

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("canceled");
  });
});
