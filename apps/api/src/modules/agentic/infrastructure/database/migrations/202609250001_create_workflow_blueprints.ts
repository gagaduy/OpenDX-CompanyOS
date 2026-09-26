// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS workflow_blueprints (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(64) NOT NULL DEFAULT 'operations',
      description TEXT,
      target_outcome TEXT,
      version VARCHAR(16) NOT NULL DEFAULT 'v1.0',
      status VARCHAR(32) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
      nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
      edges JSONB NOT NULL DEFAULT '[]'::jsonb,
      policy_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(128)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_blueprints_code ON workflow_blueprints (code);
    CREATE INDEX IF NOT EXISTS idx_workflow_blueprints_status ON workflow_blueprints (status);

    -- Seed Initial Flagship Enterprise Workflows
    INSERT INTO workflow_blueprints (
      id, code, name, category, description, target_outcome, version, status, policy_rules, nodes, edges
    ) VALUES (
      'wf-customer-recovery-v1',
      'WF-CSKH-RECOVERY',
      'Cứu Khách Hàng Khiếu Nại & Bồi Thường Nhanh',
      'customer_recovery',
      'Tự động phân loại bức xúc của khách hàng, huy động AI CSKH lập phương án bồi thường thiện chí và xin lỗi, tự động giải quyết các ca nhỏ và chỉ chuyển Sếp duyệt khi vượt hạn mức.',
      'Xoa dịu khách hàng trong vòng 5 phút, giữ chân khách quen và ngăn chặn nguy cơ đánh giá tiêu cực công khai.',
      'v1.0',
      'published',
      '{"auto_approval_threshold": 200000, "currency": "VND", "approval_gate_role": "support_manager"}'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    ), (
      'wf-marketing-launch-v1',
      'WF-MKT-LAUNCH',
      'Kích Hoạt Chiến Dịch Marketing & Đa Kênh',
      'marketing_launch',
      'Tự động phát hiện sản phẩm mới xuất bản trong Catalog, huy động AI Marketing phân tích điểm bán hàng (USP), tạo nội dung đa kênh, tự động đăng bài hữu cơ 0đ và chỉ chuyển CMO duyệt nếu chi tiền quảng cáo.',
      'Phủ sóng sản phẩm mới trên Facebook & Instagram trong 15 phút, tăng tỷ lệ tiếp cận tự nhiên 300% với chi phí tối ưu.',
      'v1.0',
      'published',
      '{"paid_budget_threshold": 0, "currency": "VND", "approval_gate_role": "marketing_director"}'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    ), (
      'wf-inventory-replenish-v1',
      'WF-INV-REPLENISH',
      'Cảnh Báo Tồn Kho & Tự Động Đề Xuất Nhập Hàng',
      'inventory_replenish',
      'Tự động theo dõi ngưỡng an toàn kho hàng, huy động AI Kho Vận tính toán tốc độ bán (run-rate), tự động đặt hàng nhà cung cấp với đơn nhỏ và chỉ chuyển Giám Đốc ký khi đơn vượt hạn mức.',
      'Đảm bảo không bao giờ đứt hàng sản phẩm chủ lực (Hero SKU), tối ưu vốn lưu động và rút ngắn chu kỳ đặt hàng về dưới 24h.',
      'v1.0',
      'published',
      '{"auto_po_threshold": 10000000, "currency": "VND", "approval_gate_role": "finance_director"}'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    ) ON CONFLICT (code) DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS workflow_blueprints;
  `);
}
