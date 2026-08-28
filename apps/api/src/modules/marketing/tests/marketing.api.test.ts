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
import type { MarketingArtifactService } from "../application/services/interfaces/marketing-artifact-generator.service";
import type {
  MarketingArtifact,
  MarketingCampaignDetailResponseDto,
  MarketingCampaignListResponseDto,
  MarketingCampaignResponseDto,
} from "../application/dtos/marketing.dto";
import { MarketingApplicationError } from "../presentation/middleware/marketing-error.middleware";

function createTestApp(
  service: IMarketingCampaignService,
  artifactService?: MarketingArtifactService,
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

  const controller = new MarketingController(service, artifactService);
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

  const sampleArtifact: MarketingArtifact = {
    id: "00000000-0000-4000-8000-000000000008",
    campaignId: sampleCampaignDto.id,
    kind: "campaign_brief_docx",
    filename: "brief.docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: 1024,
    sha256Digest: "a".repeat(64),
    storageKey: "marketing/test/brief.docx",
    createdAt: "2026-08-29T10:00:00.000Z",
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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["catalog_manager"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_auditor"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_approver"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

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
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

    const response = await request(app)
      .post(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}/cancel`)
      .set("Authorization", "Bearer valid-token")
      .send({ reason: "User request" });

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("canceled");
  });

  it("POST /campaigns/:campaignId/approve allows approver to approve publication package", async () => {
    const approvedDto = { ...sampleCampaignDto, state: "awaiting_human_approval" as const, version: 2 };
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn().mockResolvedValue(approvedDto),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_approver"]);

    const response = await request(app)
      .post(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}/approve`)
      .set("Authorization", "Bearer valid-token")
      .send({ decision: "approve" });

    expect(response.status).toBe(200);
    expect(mockService.approveCampaign).toHaveBeenCalledWith("staff-operator-1", sampleCampaignDto.id, {
      decision: "approve",
    });
  });

  it("POST /campaigns/:campaignId/request-revision allows operator to request revision", async () => {
    const revisionDto = { ...sampleCampaignDto, state: "revision_requested" as const, version: 2 };
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn(),
      requestRevision: vi.fn().mockResolvedValue(revisionDto),
      qualityFeedback: vi.fn(),
    };

    const app = createTestApp(mockService, undefined, ["agentic_operator"]);

    const response = await request(app)
      .post(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}/request-revision`)
      .set("Authorization", "Bearer valid-token")
      .send({ feedback: "Change visual color to match brand", targetVersion: "visual" });

    expect(response.status).toBe(200);
    expect(mockService.requestRevision).toHaveBeenCalledWith("staff-operator-1", sampleCampaignDto.id, {
      feedback: "Change visual color to match brand",
      targetVersion: "visual",
    });
  });

  it("POST /campaigns/:campaignId/generate-deliverables generates all 5 artifacts", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };
    const mockArtifactService: MarketingArtifactService = {
      generateAllDeliverables: vi.fn().mockResolvedValue([sampleArtifact]),
      getArtifactById: vi.fn(),
      getArtifactPayload: vi.fn(),
      listArtifactsByCampaignId: vi.fn(),
    };

    const app = createTestApp(mockService, mockArtifactService, ["agentic_operator"]);

    const response = await request(app)
      .post(`/v1/admin/marketing/campaigns/${sampleCampaignDto.id}/generate-deliverables`)
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(mockArtifactService.generateAllDeliverables).toHaveBeenCalledWith(sampleCampaignDto.id);
  });

  it("GET /artifacts/:artifactId/download downloads raw binary stream", async () => {
    const mockService: IMarketingCampaignService = {
      createCampaign: vi.fn(),
      getCampaign: vi.fn(),
      listCampaigns: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
    };
    const sampleBuffer = Buffer.from("PK\x03\x04test_docx");
    const mockArtifactService: MarketingArtifactService = {
      generateAllDeliverables: vi.fn(),
      getArtifactById: vi.fn(),
      getArtifactPayload: vi.fn().mockResolvedValue({
        artifact: sampleArtifact,
        buffer: sampleBuffer,
      }),
      listArtifactsByCampaignId: vi.fn(),
    };

    const app = createTestApp(mockService, mockArtifactService, ["agentic_auditor"]);

    const response = await request(app)
      .get(`/v1/admin/marketing/artifacts/${sampleArtifact.id}/download`)
      .set("Authorization", "Bearer valid-token")
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.header["content-type"]).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(response.header["content-disposition"]).toContain('attachment; filename="brief.docx"');
    expect(response.body).toEqual(sampleBuffer);
  });
});
