// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { PaymentGateway, NormalizedPaymentNotification } from "../../providers/payment-gateway";
import type { PaymentRepository } from "../../repositories/interfaces/payment.repository";
import { PaymentNotificationService } from "./payment-notification.service";

const now = "2026-08-06T08:05:00.000Z";
const session: DatabaseSession = { query: vi.fn() };
const paidNotification: NormalizedPaymentNotification = { notificationType:"ORDER_PAID",providerEventId:"event-1",providerOrderId:"SEPAY-1",providerTransactionId:"txn-1",invoiceNumber:"NVC-PAY-A1000000000040008000000000000001",orderStatus:"CAPTURED",transactionStatus:"APPROVED",amountVnd:100_000,currency:"VND",state:"paid",redactedPayload:{ notification_type:"ORDER_PAID" } };

function fixture(notification = paidNotification, providerOrderId?: string) {
  const aggregate = { payment:{ id:"payment-1",orderId:"order-1",provider:"sepay" as const,expectedAmountVnd:100_000,currency:"VND" as const,status:"pending_provider" as const,activeAttemptId:"attempt-1",version:2,createdAt:now,updatedAt:now }, activeAttempt:{ id:"attempt-1",paymentId:"payment-1",providerInvoiceNumber:paidNotification.invoiceNumber,...(providerOrderId===undefined?{}:{providerOrderId}),state:"pending_provider" as const,idempotencyKey:"key-1",expiresAt:"2026-08-06T08:15:00.000Z",createdAt:now,updatedAt:now } };
  const seen = new Set<string>();
  const repository: PaymentRepository = {
    create:vi.fn(),findById:vi.fn(async()=>aggregate),findByOrderId:vi.fn(async()=>aggregate),findByInvoiceNumber:vi.fn(async(_session,invoice)=>invoice===aggregate.activeAttempt.providerInvoiceNumber?aggregate:undefined),
    updateState:vi.fn(async()=>true),insertEvent:vi.fn(async(_session,event)=>{if(seen.has(event.payloadHash))return false;seen.add(event.payloadHash);return true;}),linkEvent:vi.fn(),updateEventResult:vi.fn(),list:vi.fn(async()=>({items:[],totalItems:0})),listReconciliations:vi.fn(async()=>[]),insertReconciliation:vi.fn(),attachProviderOrderId:vi.fn(async()=>true),listDuePending:vi.fn(async()=>[]),appendAudit:vi.fn(),
  };
  const gateway: PaymentGateway = { createCheckout:vi.fn(),getOrderDetail:vi.fn(),normalizeNotification:vi.fn(()=>notification) };
  const orders = { createPending:vi.fn(),transitionInSession:vi.fn(async()=>({ id:"order-1",publicNumber:"NVC-1",customerId:"customer-1",checkoutId:"checkout-1",addressSnapshot:{addressId:"a",recipientName:"Buyer",phoneNumber:"0",addressLine:"1",ward:"w",provinceOrCity:"c",version:1},contactSnapshot:{email:"buyer@example.com"},subtotalVnd:100_000,discountVnd:0,totalVnd:100_000,currency:"VND" as const,taxMode:"included_not_separated" as const,status:"paid" as const,reservationExpiresAt:"2026-08-06T08:15:00.000Z",paidAt:now,version:2,createdAt:now,updatedAt:now})) };
  const inventory={reserveInSession:vi.fn(),releaseInSession:vi.fn(),consumeInSession:vi.fn()};
  const promotions={hold:vi.fn(),release:vi.fn(),commit:vi.fn()};
  const checkouts={completePaid:vi.fn(async()=>({checkoutId:"checkout-1",cartId:"cart-1",customerId:"customer-1"}))};
  const carts={finalizePaidCheckout:vi.fn()};
  const transactions:TransactionRunner={run:(work)=>work(session),runReadOnly:(work)=>work(session)};
  const service=new PaymentNotificationService(repository,gateway,orders,inventory,promotions,checkouts,carts,transactions,()=>"event-id",()=>now);
  return {carts,checkouts,inventory,orders,promotions,repository,service};
}

describe("PaymentNotificationService",()=>{
  it("applies matching trusted evidence once and acknowledges its replay",async()=>{
    const f=fixture();
    await expect(f.service.process({same:"payload"},"corr-1")).resolves.toEqual({result:"applied"});
    await expect(f.service.process({same:"payload"},"corr-2")).resolves.toEqual({result:"already_processed"});
    expect(f.repository.updateState).toHaveBeenCalledTimes(1); expect(f.orders.transitionInSession).toHaveBeenCalledTimes(1);
    expect(f.inventory.consumeInSession).toHaveBeenCalledTimes(1); expect(f.promotions.commit).toHaveBeenCalledTimes(1);
    expect(f.checkouts.completePaid).toHaveBeenCalledTimes(1); expect(f.carts.finalizePaidCheckout).toHaveBeenCalledTimes(1);
  });
  it("records unsupported and mismatched evidence for review without changing business state",async()=>{
    const unsupported=fixture({...paidNotification,notificationType:"TRANSACTION_VOID",state:"unsupported"});
    await expect(unsupported.service.process({kind:"void"},"corr-1")).resolves.toEqual({result:"review_required"});
    const mismatch=fixture({...paidNotification,amountVnd:99_999});
    await expect(mismatch.service.process({kind:"amount"},"corr-2")).resolves.toEqual({result:"review_required"});
    const currency=fixture({...paidNotification,currency:"USD"});
    await expect(currency.service.process({kind:"currency"},"corr-3")).resolves.toEqual({result:"review_required"});
    const invoice=fixture({...paidNotification,invoiceNumber:"UNKNOWN-INVOICE"});
    await expect(invoice.service.process({kind:"invoice"},"corr-4")).resolves.toEqual({result:"review_required"});
    const providerOrder=fixture(paidNotification,"SEPAY-OTHER");
    await expect(providerOrder.service.process({kind:"provider-order"},"corr-5")).resolves.toEqual({result:"review_required"});
    for(const current of [unsupported,mismatch,currency,invoice,providerOrder]) expect(current.repository.updateState).not.toHaveBeenCalled();
  });
});
