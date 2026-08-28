// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export * from "./domain/entities/marketing-campaign";
export * from "./domain/services/marketing-campaign-rules";
export * from "./application/dtos/marketing.dto";
export * from "./application/ports/facebook-publisher.port";
export * from "./application/repositories/interfaces/marketing.repository";
export * from "./application/services/interfaces/marketing-campaign.service";
export * from "./application/services/interfaces/marketing-publisher.service";
export * from "./application/services/interfaces/marketing-artifact-generator.service";
export * from "./application/services/implementations/marketing-artifact.service";
export * from "./infrastructure/adapters/meta-graph-facebook-publisher.adapter";
export * from "./infrastructure/workers/marketing-publisher.worker";
export * from "./marketing.module";
