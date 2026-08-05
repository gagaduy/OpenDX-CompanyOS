// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { CustomerPrincipal, IssuedSession } from "../../dtos/customer.dto";
export interface CustomerAuthenticationServiceContract { loginWithGoogle(credential:string):Promise<IssuedSession<CustomerPrincipal>>; logout(rawToken:string):Promise<void> }
