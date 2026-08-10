// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const timestamp=z.iso.datetime(); const range=z.object({start:z.string(),end:z.string(),timezone:z.literal("Asia/Ho_Chi_Minh")}); const envelope=<T extends z.ZodTypeAny>(data:T)=>z.object({data,refreshedAt:timestamp,range});
export const commerceEnvelopeSchema=envelope(z.object({grossPaidRevenueVnd:z.number().int(),paidOrderCount:z.number().int(),averageOrderValueVnd:z.number().int(),conversionRateBasisPoints:z.number().int(),paymentStatuses:z.array(z.object({status:z.string(),count:z.number().int()}))}));
export const productsEnvelopeSchema=envelope(z.object({items:z.array(z.object({sku:z.string(),productTitle:z.string(),quantitySold:z.number().int(),paidRevenueVnd:z.number().int()})),inventory:z.object({onHand:z.number().int(),reserved:z.number().int(),available:z.number().int(),soldOutCount:z.number().int()})}));
export const customersEnvelopeSchema=envelope(z.object({totalRegisteredCustomers:z.number().int(),repeatCustomers:z.number().int(),lifetimeValueVnd:z.number().int(),lifetimeValueBuckets:z.array(z.object({bucket:z.enum(["zero","low","mid","high"]),count:z.number().int()}))}));
export const operationsEnvelopeSchema=envelope(z.object({openTickets:z.number().int(),overdueFollowups:z.number().int(),slaBreaches:z.number().int()}));
export const dashboardErrorSchema=z.object({success:z.literal(false).optional(),message:z.string().optional(),errorCode:z.string().optional()});
