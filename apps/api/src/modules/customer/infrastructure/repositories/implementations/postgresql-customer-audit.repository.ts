// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { CustomerAuditRepository } from "../../../application/repositories/interfaces/customer-audit.repository";
export class PostgresqlCustomerAuditRepository implements CustomerAuditRepository { async append(s:Parameters<CustomerAuditRepository["append"]>[0],e:Parameters<CustomerAuditRepository["append"]>[1]){await s.query("INSERT INTO audit_events(id,actor_type,actor_id,action,resource_type,resource_id,outcome,correlation_id,metadata,occurred_at) VALUES($1,'customer',$2,$3,$4,$5,$6,$7,'{}'::jsonb,$8)",[e.id,e.actorId,e.action,e.resourceType,e.resourceId,e.outcome,e.correlationId,e.occurredAt]);} }
