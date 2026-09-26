// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { analyzeSupportTaskIntent } from "../utils/support-task-intent";

describe("analyzeSupportTaskIntent", () => {
  it("routes a Flash Sale customer email request to a verified promotion campaign", () => {
    expect(
      analyzeSupportTaskIntent(
        "Cửa hàng đang có Flash Sale, hãy lên ý tưởng gửi email cho toàn bộ khách hàng",
      ),
    ).toEqual({
      kind: "email_campaign",
      campaignType: "promotion_announcement",
      targetSegment: "all_active_customers",
    });
  });

  it.each([
    "Rà soát toàn bộ phản hồi về sản phẩm lỗi cần xử lý",
    "Gửi mail phản hồi các email khách hàng đang thắc mắc về bảo hành",
  ])("keeps customer issues in the pending-ticket response flow: %s", (prompt) => {
    expect(analyzeSupportTaskIntent(prompt)).toEqual({ kind: "ticket_resolution" });
  });

  it("supports a general broadcast email without inventing a promotion", () => {
    expect(analyzeSupportTaskIntent("Lên ý tưởng gửi mail cho toàn bộ khách hàng")).toEqual({
      kind: "email_campaign",
      campaignType: "customer_care_vip",
      targetSegment: "all_active_customers",
    });
  });
});
