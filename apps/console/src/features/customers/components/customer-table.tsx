// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import type { CustomerSummaryView } from "../types/customer.types";

export function CustomerTable({customers}:{readonly customers:readonly CustomerSummaryView[]}) {
  return <div className="tableShell" role="region" aria-label="Customer table"><table className="dataTable"><thead><tr><th>Customer</th><th>Status</th><th>Phone</th><th>Created</th><th>Action</th></tr></thead><tbody>{customers.map((customer)=><tr key={customer.id}><td><strong>{customer.fullName??"Unnamed customer"}</strong><span>{customer.email}</span></td><td>{customer.status}</td><td>{customer.phoneNumber??"—"}</td><td>{new Date(customer.createdAt).toLocaleDateString("vi-VN")}</td><td><Link className="secondaryButton" to={`/customers/${customer.id}`}>Open customer 360</Link></td></tr>)}</tbody></table></div>;
}
