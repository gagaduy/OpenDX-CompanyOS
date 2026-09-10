// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export * from "./domain/entities/marketing-campaign";
export * from "./domain/services/marketing-campaign-rules";
export * from "./application/dtos/marketing.dto";
export * from "./application/ports/facebook-publisher.port";
export * from "./application/ports/marketing-public-media-storage.port";
export * from "./application/repositories/interfaces/marketing.repository";
export * from "./application/services/interfaces/marketing-campaign.service";
export * from "./application/services/interfaces/marketing-publisher.service";
export * from "./application/services/interfaces/marketing-artifact-generator.service";
export * from "./application/services/interfaces/marketing-public-media.service";
export * from "./application/services/implementations/marketing-artifact.service";
export * from "./infrastructure/adapters/meta-graph-facebook-publisher.adapter";
export * from "./infrastructure/storage/minio-marketing-artifact.storage";
export * from "./infrastructure/workers/marketing-publisher.worker";
export * from "./domain/entities/social-account";
export * from "./domain/repositories/social-account.repository";
export * from "./application/dtos/social-token.dto";
export * from "./application/ports/social-token-inspector.port";
export * from "./application/ports/social-token-refresher.port";
export * from "./application/services/interfaces/social-token-manager.service";
export * from "./application/services/interfaces/autonomous-social-token-monitor.service";
export * from "./infrastructure/adapters/meta-graph-social-token.adapter";
export * from "./infrastructure/repositories/implementations/postgresql-social-account.repository";
export * from "./application/services/implementations/social-token-manager.service";
export * from "./application/services/implementations/autonomous-social-token-monitor.service";
export * from "./marketing.module";
