// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type { CustomerSegmentQueryPort } from "../../application/ports/customer-segment-query.port";
import type {
  CampaignRecipientItem,
  CustomerSegmentType,
} from "../../domain/entities/email-campaign.entity";

export class DatabaseCustomerSegmentQueryAdapter
  implements CustomerSegmentQueryPort
{
  constructor(private readonly database: Pool) {}

  async getCustomersBySegment(
    segment: CustomerSegmentType,
  ): Promise<CampaignRecipientItem[]> {
    let whereCondition = "";
    if (segment === "vip_customers") {
      whereCondition = "HAVING COALESCE(SUM(o.total_vnd), 0) >= 2000000 OR COUNT(o.id) >= 2";
    } else if (segment === "recent_buyers") {
      whereCondition = "HAVING MAX(o.created_at) >= NOW() - INTERVAL '60 days'";
    }

    const query = `
      SELECT 
        c.id AS customer_id,
        c.email,
        COALESCE(c.full_name, 'Khách hàng thân thiết') AS full_name,
        COALESCE(SUM(o.total_vnd), 0) AS total_spent_vnd,
        COUNT(o.id) AS order_count
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      WHERE c.status = 'active'
        AND c.email IS NOT NULL
        AND c.email != ''
      GROUP BY c.id, c.email, c.full_name
      ${whereCondition}
      ORDER BY total_spent_vnd DESC, order_count DESC
      LIMIT 100
    `;

    try {
      const result = await this.database.query<{
        customer_id: string;
        email: string;
        full_name: string;
        total_spent_vnd: string | number;
        order_count: string | number;
      }>(query);

      return result.rows.map((row) => ({
        customerId: row.customer_id,
        email: row.email.trim(),
        fullName: row.full_name,
        totalSpentVnd: Number(row.total_spent_vnd) || 0,
        orderCount: Number(row.order_count) || 0,
        isSelected: true,
      }));
    } catch {
      return [];
    }
  }

  async getCustomerCountBySegment(
    segment: CustomerSegmentType,
  ): Promise<number> {
    const list = await this.getCustomersBySegment(segment);
    return list.length;
  }
}
