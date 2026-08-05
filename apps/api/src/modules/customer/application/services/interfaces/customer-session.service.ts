// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { CustomerPrincipal, GuestPrincipal, IssuedSession } from "../../dtos/customer.dto";
export interface CustomerSessionServiceContract { createGuest():Promise<IssuedSession<GuestPrincipal>>; resolveGuest(raw:string):Promise<GuestPrincipal>; resolveCustomer(raw:string,rotate?:boolean):Promise<IssuedSession<CustomerPrincipal>> }
