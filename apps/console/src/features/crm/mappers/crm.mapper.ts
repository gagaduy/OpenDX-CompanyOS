// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Customer360View, FollowupView } from "../types/crm.types";

export function mapCustomer360(value:Customer360View):Customer360View { return { ...value, customer:{...value.customer,addresses:value.customer.addresses.map(a=>({...a}))}, orders:value.orders.map(o=>({...o})), notes:value.notes.map(n=>({...n})), followups:value.followups.map(f=>({...f})) }; }
export function mapFollowup(value:FollowupView):FollowupView { return {...value}; }
