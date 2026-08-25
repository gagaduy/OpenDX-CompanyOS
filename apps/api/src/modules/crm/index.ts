// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createCrmHealthReader,
  createCrmModule,
  type CrmHealthDependencies,
  type CrmModuleDependencies,
} from "./crm.module";
export type { CrmContext } from "./application/dtos/crm.dto";
export type {
  CrmOperationsSummaryReader,
  CrmServiceContract,
} from "./application/services/interfaces/crm.service";
export type {
  CrmFollowupHealth,
  CrmHealthReader,
  CrmHealthSegment,
  CrmHealthWindow,
  CrmLifetimeValueBucket,
  CrmRecencyBucket,
  CrmSegmentHealth,
  FollowupOpportunityReason,
} from "./application/services/interfaces/crm-health-reader";
