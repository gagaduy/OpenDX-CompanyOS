// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { Customer } from "../../domain/entities/customer"; import type { CustomerAddress } from "../../domain/entities/customer-address";
export interface CustomerPrincipal { readonly customerId: string; readonly sessionId: string; readonly email: string; readonly expiresAt: string }
export interface GuestPrincipal { readonly guestSessionId: string; readonly expiresAt: string }
export interface IssuedSession<T> { readonly principal: T; readonly rawToken: string }
export interface CustomerProfileDto { readonly id: string; readonly email: string; readonly fullName?: string; readonly phoneNumber?: string; readonly version: number }
export type AddressDto = CustomerAddress;
export function toProfile(customer: Customer): CustomerProfileDto { return { id: customer.id, email: customer.email, ...(customer.fullName === undefined ? {} : { fullName: customer.fullName }), ...(customer.phoneNumber === undefined ? {} : { phoneNumber: customer.phoneNumber }), version: customer.version }; }
