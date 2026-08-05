// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { ErrorRequestHandler } from "express"; import { ApplicationError } from "../../../../shared/http/application-error"; import { CustomerApplicationError } from "../../application/services/customer-application.error"; import { CustomerDomainError } from "../../domain/exceptions/customer-domain.error";
const status:Record<string,number>={GOOGLE_TOKEN_INVALID:401,GOOGLE_IDENTITY_CONFLICT:409,CUSTOMER_SESSION_EXPIRED:401,CUSTOMER_DISABLED:403,ADDRESS_NOT_FOUND:404,STALE_VERSION:409,INVALID_ADDRESS:400,INVALID_CUSTOMER_PROFILE:400};
export const customerErrorMiddleware:ErrorRequestHandler=(error,_req,_res,next)=>{if(error instanceof CustomerApplicationError||error instanceof CustomerDomainError){next(new ApplicationError(status[error.code]??400,error.code,error.message));return;}next(error);};
