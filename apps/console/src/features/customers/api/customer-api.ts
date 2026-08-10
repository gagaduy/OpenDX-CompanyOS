// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { mapCustomerPage, mapSegments } from "../mappers/customer.mapper";
import { customerPageEnvelopeSchema, errorEnvelopeSchema, segmentListEnvelopeSchema } from "../schemas/customer-api.schema";
import type { CustomerPageView, CustomerQuery, CustomerSegmentListView } from "../types/customer.types";

export type CustomerErrorCode = "UNAUTHORIZED"|"FORBIDDEN"|"VALIDATION_ERROR"|"INVALID_RESPONSE"|"UNAVAILABLE";
export class CustomerApiError extends Error { constructor(readonly code:CustomerErrorCode,message:string){ super(message); this.name="CustomerApiError"; } }
export interface CustomerOperationsApi { search(query:CustomerQuery, signal?:AbortSignal):Promise<CustomerPageView>; segments(signal?:AbortSignal):Promise<CustomerSegmentListView>; }
export function createCustomerOperationsApi(baseUrl:string, accessToken:string):CustomerOperationsApi {
  const request=createRequest(baseUrl,accessToken);
  return {
    async search(query,signal){ const params=new URLSearchParams({ page:String(query.page), pageSize:String(query.pageSize) }); if(query.search)params.set("search",query.search); const path=query.segment===undefined?`/v1/admin/customers?${params}`:`/v1/admin/customers/segments/${query.segment}/customers?${params}`; return mapCustomerPage(parse(customerPageEnvelopeSchema,await request(path,{signal})).data as CustomerPageView); },
    async segments(signal){ return mapSegments(parse(segmentListEnvelopeSchema,await request("/v1/admin/customers/segments",{signal})).data as CustomerSegmentListView); },
  };
}
function createRequest(baseUrl:string, accessToken:string){ return async(path:string,init?:RequestInit):Promise<unknown>=>{ let response:Response; try{ response=await fetch(`${baseUrl}${path}`,{...init,headers:{authorization:`Bearer ${accessToken}`,"x-correlation-id":crypto.randomUUID(),...init?.headers}}); } catch(error){ if(error instanceof DOMException&&error.name==="AbortError")throw error; throw new CustomerApiError("UNAVAILABLE","Customer service is unavailable."); } const body:unknown=await response.json().catch(()=>undefined); if(!response.ok){ const parsed=errorEnvelopeSchema.safeParse(body); throw new CustomerApiError(parsed.success?normalize(parsed.data.errorCode):"UNAVAILABLE","Customers could not be loaded."); } return body; }; }
function parse<T>(schema:ZodType<T>,value:unknown):T{ const parsed=schema.safeParse(value); if(!parsed.success)throw new CustomerApiError("INVALID_RESPONSE","Invalid customer response."); return parsed.data; }
function normalize(code:string):CustomerErrorCode{ return code==="UNAUTHORIZED"||code==="FORBIDDEN"||code==="VALIDATION_ERROR"?code:"UNAVAILABLE"; }
