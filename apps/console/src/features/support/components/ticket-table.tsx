// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import type { SupportTicketView } from "../types/support.types";

export function TicketTable({
  tickets,
  onClaim,
  pending,
}: {
  readonly tickets: readonly SupportTicketView[];
  readonly onClaim: (ticket: SupportTicketView) => void;
  readonly pending?: string;
}) {
  return (
    <div className="tableViewport">
      <table className="operationsTable" aria-label="Support tickets">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Customer</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <Link
                  to={`/support/${ticket.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <strong>{ticket.subject}</strong>
                </Link>
                <small>{ticket.id}</small>
              </td>
              <td>{ticket.customerEmail || ticket.customerId}</td>
              <td>{ticket.priority}</td>
              <td>{ticket.status}</td>
              <td>{new Date(ticket.updatedAt).toLocaleString("vi-VN")}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Link className="secondaryButton" to={`/support/${ticket.id}`}>
                    Open
                  </Link>
                  {ticket.status === "new" ? (
                    <button
                      className="primaryButton"
                      type="button"
                      disabled={pending === ticket.id}
                      onClick={() => onClaim(ticket)}
                    >
                      {pending === ticket.id ? "Claiming…" : "Claim ticket"}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
