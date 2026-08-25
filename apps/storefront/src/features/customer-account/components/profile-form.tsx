// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type {
  CustomerProfile,
  ProfileInput,
} from "../types/customer-account.types";
export function ProfileForm({
  profile,
  disabled,
  onSubmit,
}: {
  readonly profile: CustomerProfile;
  readonly disabled: boolean;
  readonly onSubmit: (value: ProfileInput) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const phoneNumber = String(form.get("phoneNumber") ?? "").trim();
    void onSubmit({
      ...(fullName ? { fullName } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      version: profile.version,
    });
  };
  return (
    <form className="account-form" onSubmit={submit}>
      <label className="verified-email">
        Email đã xác minh
        <span>
          <input value={profile.email} readOnly />
          <CheckCircle2 aria-hidden="true" />
        </span>
      </label>
      <label>
        Họ và tên
        <input
          name="fullName"
          defaultValue={profile.fullName ?? ""}
          maxLength={120}
        />
      </label>
      <label>
        Số điện thoại
        <input
          name="phoneNumber"
          defaultValue={profile.phoneNumber ?? ""}
          maxLength={30}
        />
      </label>
      <button className="button primary" disabled={disabled}>
        Lưu thay đổi
      </button>
    </form>
  );
}
