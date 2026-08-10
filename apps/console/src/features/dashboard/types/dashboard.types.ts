// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ReportingRangeView { readonly start:string; readonly end:string; readonly timezone:"Asia/Ho_Chi_Minh"; }
export interface DashboardRangeInput { readonly start:string; readonly end:string; }
export interface CommerceReportView { readonly grossPaidRevenueVnd:number; readonly paidOrderCount:number; readonly averageOrderValueVnd:number; readonly conversionRateBasisPoints:number; readonly paymentStatuses:readonly {readonly status:string;readonly count:number}[]; }
export interface ProductReportView { readonly items:readonly {readonly sku:string;readonly productTitle:string;readonly quantitySold:number;readonly paidRevenueVnd:number}[]; readonly inventory:{readonly onHand:number;readonly reserved:number;readonly available:number;readonly soldOutCount:number}; }
export interface CustomerReportView { readonly totalRegisteredCustomers:number; readonly repeatCustomers:number; readonly lifetimeValueVnd:number; readonly lifetimeValueBuckets:readonly {readonly bucket:"zero"|"low"|"mid"|"high";readonly count:number}[]; }
export interface OperationsReportView { readonly openTickets:number; readonly overdueFollowups:number; readonly slaBreaches:number; }
export interface DashboardView { readonly range:ReportingRangeView; readonly refreshedAt:string; readonly commerce:CommerceReportView; readonly products:ProductReportView; readonly customers:CustomerReportView; readonly operations:OperationsReportView; }
