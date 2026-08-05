// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { RequestHandler } from "express"; import type { CustomerProfileServiceContract } from "../../application/services/interfaces/customer-profile.service"; import { successResponse } from "../../../../shared/http/api-response"; import { customerState } from "../middleware/customer-session.middleware"; import { addressCreateSchema,addressUpdateSchema,idSchema,parseBody,profileSchema } from "../validators/customer.validator";
export class CustomerAccountController { constructor(private readonly service:CustomerProfileServiceContract){}
 get:RequestHandler=async(_req,res,next)=>{try{res.json(successResponse("Customer account retrieved",await this.service.get(customerState(res).customerId)));}catch(e){next(e);}};
 update:RequestHandler=async(req,res,next)=>{try{res.json(successResponse("Customer account updated",await this.service.update(customerState(res).customerId,parseBody(profileSchema,req.body))));}catch(e){next(e);}};
 listAddresses:RequestHandler=async(_req,res,next)=>{try{res.json(successResponse("Addresses retrieved",await this.service.listAddresses(customerState(res).customerId)));}catch(e){next(e);}};
 createAddress:RequestHandler=async(req,res,next)=>{try{res.status(201).json(successResponse("Address created",await this.service.createAddress(customerState(res).customerId,parseBody(addressCreateSchema,req.body))));}catch(e){next(e);}};
 updateAddress:RequestHandler=async(req,res,next)=>{try{res.json(successResponse("Address updated",await this.service.updateAddress(customerState(res).customerId,parseBody(idSchema,req.params.addressId),parseBody(addressUpdateSchema,req.body))));}catch(e){next(e);}};
 deleteAddress:RequestHandler=async(req,res,next)=>{try{await this.service.deleteAddress(customerState(res).customerId,parseBody(idSchema,req.params.addressId));res.json(successResponse("Address deleted",{}));}catch(e){next(e);}};
 defaultAddress:RequestHandler=async(req,res,next)=>{try{await this.service.setDefaultAddress(customerState(res).customerId,parseBody(idSchema,req.params.addressId));res.json(successResponse("Default address updated",{}));}catch(e){next(e);}};
}
