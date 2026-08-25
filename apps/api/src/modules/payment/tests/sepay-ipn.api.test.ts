// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../../../app";
import type { PaymentNotificationServiceContract } from "../application/services/interfaces/payment-notification.service";
import { SePayIpnController } from "../presentation/controllers/sepay-ipn.controller";
import { authenticateSePayIpn } from "../presentation/middleware/sepay-ipn-auth.middleware";
import { createSePayIpnRouter } from "../presentation/routes/sepay-ipn.routes";

function fixture() {
  const service: PaymentNotificationServiceContract = { process: vi.fn(async()=>({result:"applied" as const})) };
  const app=createApiApp({sepayWebhookRouter:createSePayIpnRouter(new SePayIpnController(service),authenticateSePayIpn("ipn-secret"))});
  return {app,service};
}
describe("SePay IPN API boundary",()=>{
  it.each([undefined,"wrong-secret"])("rejects missing or wrong authentication before payload parsing",async(secret)=>{
    const {app,service}=fixture();
    const operation=request(app).post("/v1/webhooks/sepay").set("content-type","application/json");
    if(secret!==undefined) operation.set("x-secret-key",secret);
    await operation.send("{malformed").expect(401);
    expect(service.process).not.toHaveBeenCalled();
  });
  it("returns 400 for an authenticated malformed payload",async()=>{
    const {app,service}=fixture();
    await request(app).post("/v1/webhooks/sepay").set("x-secret-key","ipn-secret").set("content-type","application/json").send("{malformed").expect(400);
    expect(service.process).not.toHaveBeenCalled();
  });
  it("acknowledges applied, duplicate, and review outcomes with 200",async()=>{
    const {app,service}=fixture();
    for(const result of ["applied","already_processed","review_required"] as const){
      vi.mocked(service.process).mockResolvedValueOnce({result});
      const response=await request(app).post("/v1/webhooks/sepay").set("x-secret-key","ipn-secret").send({notification_type:"ORDER_PAID"}).expect(200);
      expect(response.body.data.result).toBe(result);
    }
  });
  it("returns 500 when durable processing does not commit",async()=>{
    const {app,service}=fixture(); vi.mocked(service.process).mockRejectedValueOnce(new Error("database failed"));
    await request(app).post("/v1/webhooks/sepay").set("x-secret-key","ipn-secret").send({notification_type:"ORDER_PAID"}).expect(500);
  });
});
