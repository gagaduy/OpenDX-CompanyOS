// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const timestamp=z.iso.datetime();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const safe=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const signed=z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable();
const range=z.object({start:z.string(),end:z.string(),timezone:z.literal("Asia/Ho_Chi_Minh")});
const envelope=<T extends z.ZodTypeAny>(data:T)=>z.object({data,refreshedAt:timestamp,range});
export const commerceEnvelopeSchema=envelope(z.object({grossPaidRevenueVnd:safe,paidOrderCount:safe,averageOrderValueVnd:safe,conversionRateBasisPoints:safe,comparison:z.object({previousGrossPaidRevenueVnd:safe,previousPaidOrderCount:safe,previousAverageOrderValueVnd:safe,grossPaidRevenueChangeBasisPoints:signed,paidOrderCountChangeBasisPoints:signed,averageOrderValueChangeBasisPoints:signed}),daily:z.array(z.object({date,grossPaidRevenueVnd:safe,paidOrderCount:safe})),paymentStatuses:z.array(z.object({status:z.string(),count:safe}))}));
export const productsEnvelopeSchema=envelope(z.object({items:z.array(z.object({sku:z.string(),productTitle:z.string(),quantitySold:safe,paidRevenueVnd:safe})),inventory:z.object({onHand:safe,reserved:safe,available:safe,soldOutCount:safe})}));
export const customersEnvelopeSchema=envelope(z.object({totalRegisteredCustomers:safe,repeatCustomers:safe,lifetimeValueVnd:safe,lifetimeValueBuckets:z.array(z.object({bucket:z.enum(["zero","low","mid","high"]),count:safe})),newCustomersInRange:safe,previousNewCustomersInRange:safe,newCustomersChangeBasisPoints:signed,dailyNewCustomers:z.array(z.object({date,newCustomerCount:safe}))}));
export const operationsEnvelopeSchema=envelope(z.object({openTickets:safe,overdueFollowups:safe,slaBreaches:safe}));
export const dashboardErrorSchema=z.object({success:z.literal(false).optional(),message:z.string().optional(),errorCode:z.string().optional()});
