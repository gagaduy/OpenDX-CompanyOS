// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DialogShell } from "../../../shared/components/dialog-shell";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import type { SupportOperationsApi } from "../api/support-api";
import { TicketTable } from "../components/ticket-table";
import { useSupportTickets } from "../hooks/use-support-tickets";
import type { SupportTicketView, TicketPriority, TicketStatus } from "../types/support.types";

const statuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_customer", "waiting_internal", "escalated", "resolved", "closed"];
const priorities: TicketPriority[] = ["urgent", "high", "normal", "low"];

export function SupportPage({ api }: { readonly api: SupportOperationsApi; readonly roles: readonly StaffRole[] }) {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [mutationError, setMutationError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [lastClaim, setLastClaim] = useState<SupportTicketView>();
  const query = useMemo(() => ({ status: statusParam(params.get("status")), priority: priorityParam(params.get("priority")), assignment: assignmentParam(params.get("assignment")), page: page(params.get("page")), pageSize: 20 }), [params]);
  const { data, error, loading, reload } = useSupportTickets(api, query);
  const update = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; });
  const claim = async (ticket: SupportTicketView) => { setPending(ticket.id); setMutationError(undefined); setStatus(undefined); setLastClaim(ticket); try { await api.claim(ticket.id, ticket.version); setStatus("Ticket claimed"); reload(); } catch (reason) { setMutationError(reason instanceof Error ? reason.message : "Ticket could not be claimed."); } finally { setPending(undefined); } };
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setCreatePending(true); setMutationError(undefined); try { await api.create({ customerId: String(form.get("customerId") ?? ""), orderId: String(form.get("orderId") ?? "") || undefined, subject: String(form.get("subject") ?? ""), description: String(form.get("description") ?? ""), priority: String(form.get("priority") ?? "normal") as TicketPriority }); formElement.reset(); setCreateOpen(false); setStatus("Ticket created"); reload(); } catch (reason) { setMutationError(reason instanceof Error ? reason.message : "Ticket could not be created."); } finally { setCreatePending(false); } };

  return <section className="catalogWorkspace operationsWorkspace supportWorkspace"><PageHeader eyebrow="Support operations" title="Support tickets" description={`${data?.totalItems ?? 0} staff-created tickets`} actions={<button className="primaryButton" type="button" onClick={() => setCreateOpen(true)}>Create ticket</button>} /><section className="filterBar" aria-label="Support ticket filters"><label><span>Status</span><select aria-label="Ticket status" value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Priority</span><select aria-label="Ticket priority" value={query.priority ?? ""} onChange={(event) => update("priority", event.target.value)}><option value="">All priorities</option>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Assignment</span><select aria-label="Ticket assignment" value={query.assignment ?? ""} onChange={(event) => update("assignment", event.target.value)}><option value="">All assignments</option><option value="mine">Mine</option><option value="unassigned">Unassigned</option></select></label></section>{mutationError ? <div className="pageState" role="alert"><p>{mutationError}</p>{lastClaim && <button className="secondaryButton" type="button" onClick={() => void claim(lastClaim)}>Retry claim</button>}</div> : null}{status ? <div className="pageState" role="status">{status}</div> : null}{loading && !data ? <SystemState kind="loading" title="Loading support tickets…" /> : error ? <SystemState kind="error" title="Support tickets could not be loaded" description={error} action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} /> : data?.items.length === 0 ? <SystemState kind="empty" title="No support tickets match this view." /> : data ? <><TicketTable tickets={data.items} onClaim={claim} pending={pending} /><div className="pagination"><span>{loading ? "Refreshing…" : `Page ${data.page} of ${Math.max(data.totalPages, 1)}`}</span><button className="secondaryButton" disabled={data.page <= 1} onClick={() => update("page", String(data.page - 1))}>Previous page</button><button className="secondaryButton" disabled={data.page >= data.totalPages} onClick={() => update("page", String(data.page + 1))}>Next page</button></div></> : null}<DialogShell open={createOpen} mode="drawer" title="Create ticket" onClose={() => setCreateOpen(false)}><form className="compactForm supportCreateForm" onSubmit={(event) => void create(event)}><label>Customer ID<input name="customerId" aria-label="Customer ID" required /></label><label>Order ID<input name="orderId" aria-label="Order ID" /></label><label>Subject<input name="subject" aria-label="Subject" required /></label><label>Description<textarea name="description" aria-label="Description" required /></label><label>Priority<select name="priority" aria-label="Create ticket priority" defaultValue="normal">{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><div className="dialogActions"><button className="secondaryButton" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primaryButton" type="submit" disabled={createPending}>{createPending ? "Creating…" : "Create ticket"}</button></div></form></DialogShell></section>;
}

function statusParam(value: string | null) { return statuses.includes(value as TicketStatus) ? value as TicketStatus : undefined; }
function priorityParam(value: string | null) { return priorities.includes(value as TicketPriority) ? value as TicketPriority : undefined; }
function assignmentParam(value: string | null): "mine" | "unassigned" | undefined { return value === "mine" || value === "unassigned" ? value : undefined; }
function page(value: string | null) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1; }
