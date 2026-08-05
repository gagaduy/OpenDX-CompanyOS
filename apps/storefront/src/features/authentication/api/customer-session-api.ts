// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import { mutationHeaders } from "../../../shared/http/api-client";
import { logoutEnvelopeSchema, sessionEnvelopeSchema } from "../schemas/customer-session.schema";
export class CustomerSessionApi { constructor(private readonly client: ApiClient) {} async get() { return (await this.client.request("/v1/storefront/session", sessionEnvelopeSchema)).data; } async login(credential: string) { return (await this.client.request("/v1/storefront/auth/google", sessionEnvelopeSchema, { method: "POST", headers: mutationHeaders(), body: JSON.stringify({ credential }) })).data; } async logout() { await this.client.request("/v1/storefront/logout", logoutEnvelopeSchema, { method: "POST", headers: mutationHeaders() }); } }
