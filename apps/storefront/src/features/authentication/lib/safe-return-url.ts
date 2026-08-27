// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

const unsafeCharacter = /[\\\u0000-\u001f\u007f]/;

export function safeReturnUrl(value: string | null | undefined): string {
  if (
    value === undefined ||
    value === null ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafeCharacter.test(value)
  ) {
    return "/account";
  }
  return value;
}
