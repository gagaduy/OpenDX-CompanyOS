// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import type { SupportTicketView } from "../types/support.types";

export function TicketTable({tickets,onClaim,pending}:{readonly tickets:readonly SupportTicketView[];readonly onClaim:(ticket:SupportTicketView)=>void;readonly pending?:string}){ return <div className="tableViewport"><table className="operationsTable"><thead><tr><th>Ticket</th><th>Customer</th><th>Priority</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>{tickets.map(ticket=><tr key={ticket.id}><td><strong>{ticket.subject}</strong><small>{ticket.id}</small></td><td>{ticket.customerId}</td><td>{ticket.priority}</td><td>{ticket.status}</td><td>{new Date(ticket.updatedAt).toLocaleString("vi-VN")}</td><td>{ticket.status==="new"?<button className="secondaryButton" type="button" disabled={pending===ticket.id} onClick={()=>onClaim(ticket)}>{pending===ticket.id?"Claiming…":"Claim ticket"}</button>:<Link className="secondaryButton" to={`/support/${ticket.id}`}>Open</Link>}</td></tr>)}</tbody></table></div>; }
