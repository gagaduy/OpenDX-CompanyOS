// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { CustomerAccountApi } from "../api/customer-account-api";
import type { CustomerAddress, CustomerProfile } from "../types/customer-account.types";
export function useCustomerAccount(api: CustomerAccountApi) { const [state, setState] = useState<{ loading: boolean; profile?: CustomerProfile; addresses: readonly CustomerAddress[]; error?: string }>({ loading: true, addresses: [] }); const load = useCallback(async () => { setState((value) => ({ ...value, loading: true })); try { const [profile, addresses] = await Promise.all([api.profile(), api.addresses()]); setState({ loading: false, profile, addresses }); } catch { setState((value) => ({ ...value, loading: false, error: "Không thể tải tài khoản." })); } }, [api]); useEffect(() => { void load(); }, [load]); return { ...state, reload: load }; }
