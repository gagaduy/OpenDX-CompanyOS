// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { mapDashboard } from "../mappers/dashboard.mapper";
import { commerceEnvelopeSchema, customersEnvelopeSchema, dashboardErrorSchema, operationsEnvelopeSchema, productsEnvelopeSchema } from "../schemas/dashboard-api.schema";
import type { CommerceReportView, CustomerReportView, DashboardRangeInput, DashboardView, OperationsReportView, ProductReportView, ReportingRangeView } from "../types/dashboard.types";

export type DashboardErrorCode="UNAUTHORIZED"|"FORBIDDEN"|"VALIDATION_ERROR"|"INVALID_RESPONSE"|"UNAVAILABLE";
export class DashboardApiError extends Error{constructor(readonly code:DashboardErrorCode,message:string){super(message);this.name="DashboardApiError";}}
export interface DashboardApi{load(range:DashboardRangeInput,signal?:AbortSignal):Promise<DashboardView>;}
type Envelope<T>={data:T;refreshedAt:string;range:ReportingRangeView};
export function createDashboardApi(baseUrl:string,accessToken:string):DashboardApi{const request=createRequest(baseUrl,accessToken);return{async load(range,signal){const q=new URLSearchParams([["start",range.start],["end",range.end]]);const [commerce,products,customers,operations]=await Promise.all([requestEnvelope<CommerceReportView>(commerceEnvelopeSchema,request(`/v1/admin/reporting/commerce?${q}`,signal)),requestEnvelope<ProductReportView>(productsEnvelopeSchema,request(`/v1/admin/reporting/products?${q}`,signal)),requestEnvelope<CustomerReportView>(customersEnvelopeSchema,request(`/v1/admin/reporting/customers?${q}`,signal)),requestEnvelope<OperationsReportView>(operationsEnvelopeSchema,request(`/v1/admin/reporting/operations?${q}`,signal))]);return mapDashboard({range:commerce.range,refreshedAt:commerce.refreshedAt,commerce:commerce.data,products:products.data,customers:customers.data,operations:operations.data});}};}
function createRequest(baseUrl:string,accessToken:string){return async(path:string,signal?:AbortSignal):Promise<unknown>=>{let response:Response;try{response=await fetch(`${baseUrl}${path}`,{signal,headers:{authorization:`Bearer ${accessToken}`,"x-correlation-id":crypto.randomUUID()}});}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw error;throw new DashboardApiError("UNAVAILABLE","Dashboard metrics could not be loaded.");}const body:unknown=await response.json().catch(()=>undefined);if(!response.ok){const parsed=dashboardErrorSchema.safeParse(body);throw new DashboardApiError(normalize(parsed.success?parsed.data.errorCode:undefined),"Dashboard metrics could not be loaded.");}return body;};}
async function requestEnvelope<T>(schema:ZodType<Envelope<T>>, value:Promise<unknown>):Promise<Envelope<T>>{const parsed=schema.safeParse(await value);if(!parsed.success)throw new DashboardApiError("INVALID_RESPONSE","Invalid dashboard response.");return parsed.data;}
function normalize(code:unknown):DashboardErrorCode{return code==="UNAUTHORIZED"||code==="FORBIDDEN"||code==="VALIDATION_ERROR"?code:"UNAVAILABLE";}
