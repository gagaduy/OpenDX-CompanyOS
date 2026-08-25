// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerPageView, CustomerSegmentListView } from "../types/customer.types";

export function mapCustomerPage(value: CustomerPageView): CustomerPageView {
  return { ...value, items: value.items.map((item) => ({ ...item })) };
}
export function mapSegments(value: CustomerSegmentListView): CustomerSegmentListView {
  return { ...value, items: value.items.map((item) => ({ ...item })) };
}
