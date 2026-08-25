// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CustomerSegment = "new_customer" | "first_time_buyer" | "repeat_customer" | "high_value" | "inactive_90d";
export interface CustomerSummaryView { readonly id:string; readonly email:string; readonly fullName?:string; readonly phoneNumber?:string; readonly status:"active"|"disabled"; readonly createdAt:string; }
export interface CustomerPageView { readonly items:readonly CustomerSummaryView[]; readonly page:number; readonly pageSize:number; readonly totalItems:number; readonly totalPages:number; }
export interface CustomerSegmentDefinitionView { readonly id:CustomerSegment; readonly name:string; readonly description:string; readonly customerCount:number; }
export interface CustomerSegmentListView { readonly items:readonly CustomerSegmentDefinitionView[]; readonly calculatedAt:string; }
export interface CustomerQuery { readonly search?:string; readonly segment?:CustomerSegment; readonly page:number; readonly pageSize:number; }
