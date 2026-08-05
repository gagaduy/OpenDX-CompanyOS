// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { parseCookie, stringifySetCookie } from "cookie"; import type { Request, Response } from "express";
export interface StorefrontCookieConfig { readonly guestName:string;readonly customerName:string;readonly csrfName:string;readonly secure:boolean }
export function readCookie(req:Request,name:string):string|undefined{return parseCookie(req.header("cookie")??"")[name];}
export function setSessionCookie(res:Response,name:string,value:string,expiresAt:string,config:StorefrontCookieConfig){res.append("Set-Cookie",stringifySetCookie({name,value,httpOnly:true,secure:config.secure,sameSite:"lax",path:"/v1/storefront",expires:new Date(expiresAt)}));}
export function setCsrfCookie(res:Response,value:string,config:StorefrontCookieConfig){res.append("Set-Cookie",stringifySetCookie({name:config.csrfName,value,httpOnly:false,secure:config.secure,sameSite:"lax",path:"/v1/storefront"}));}
export function clearCookie(res:Response,name:string,config:StorefrontCookieConfig){res.append("Set-Cookie",stringifySetCookie({name,value:"",httpOnly:name!==config.csrfName,secure:config.secure,sameSite:"lax",path:"/v1/storefront",expires:new Date(0)}));}
