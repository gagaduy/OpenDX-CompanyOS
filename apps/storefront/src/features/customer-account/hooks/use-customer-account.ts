// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { CustomerAccountApi } from "../api/customer-account-api";
import type {
  CustomerAddress,
  CustomerProfile,
  ProfileInput,
} from "../types/customer-account.types";
import { useOptionalCustomerSessionState } from "../../authentication";

interface CustomerAccountState {
  readonly loading: boolean;
  readonly profile?: CustomerProfile;
  readonly addresses: readonly CustomerAddress[];
  readonly error?: string;
}

export function useCustomerAccount(api: CustomerAccountApi) {
  const { session, sessionLoading } = useOptionalCustomerSessionState();
  const customerId = session?.kind === "customer" ? session.customerId : undefined;

  const [state, setState] = useState<CustomerAccountState>({
    loading: true,
    addresses: [],
  });
  const load = useCallback(async () => {
    if (sessionLoading) return;
    if (session && session.kind !== "customer") {
      setState({ loading: false, addresses: [] });
      return;
    }
    setState((value) => ({ ...value, loading: true, error: undefined }));
    try {
      const [profile, addresses] = await Promise.all([
        api.profile(),
        api.addresses(),
      ]);
      setState({ loading: false, profile, addresses });
    } catch {
      setState((value) => ({
        ...value,
        loading: false,
        error: "Không thể tải tài khoản.",
      }));
    }
  }, [api, session, sessionLoading, customerId]);

  const saveProfile = useCallback(
    async (input: ProfileInput): Promise<void> => {
      setState((value) => ({ ...value, loading: true, error: undefined }));
      try {
        const profile = await api.updateProfile(input);
        setState((value) => ({ ...value, loading: false, profile }));
      } catch {
        setState((value) => ({
          ...value,
          loading: false,
          error: "Không thể lưu hồ sơ. Vui lòng thử lại.",
        }));
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load, saveProfile };
}
