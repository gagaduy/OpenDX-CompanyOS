// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CommerceReportView, CustomerReportView, DashboardView, OperationsReportView, ProductReportView, ReportingRangeView } from "../types/dashboard.types";

export function mapDashboard(input:{range:ReportingRangeView;refreshedAt:string;commerce:CommerceReportView;products:ProductReportView;customers:CustomerReportView;operations:OperationsReportView}):DashboardView{return {...input,commerce:{...input.commerce,paymentStatuses:input.commerce.paymentStatuses.map(x=>({...x}))},products:{...input.products,items:input.products.items.map(x=>({...x})),inventory:{...input.products.inventory}},customers:{...input.customers,lifetimeValueBuckets:input.customers.lifetimeValueBuckets.map(x=>({...x}))},operations:{...input.operations}};}
