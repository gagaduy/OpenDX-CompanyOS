// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import type { SupportOperationsApi } from "../api/support-api";
import { AttachmentPanel } from "../components/attachment-panel";
import { SupportMessageComposer } from "../components/support-message-composer";
import { TicketContext } from "../components/ticket-context";
import { TicketTimeline } from "../components/ticket-timeline";
import { useSupportTicket } from "../hooks/use-support-ticket";
import type { SupportAttachmentView, TicketStatus } from "../types/support.types";

export function TicketDetailPage({ api }: { readonly api: SupportOperationsApi; readonly roles: readonly StaffRole[] }) {
  const { ticketId } = useParams();
  const { data, error, loading, reload, replace } = useSupportTicket(api, ticketId);
  const [mutationError, setMutationError] = useState<string>();
  const [composerError, setComposerError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [lastStatus, setLastStatus] = useState<TicketStatus>();
  const [lastMessage, setLastMessage] = useState<string>();
  const [messagePending, setMessagePending] = useState(false);

  const transition = async (target: TicketStatus) => {
    if (!data) return;
    setMutationError(undefined);
    setStatus(undefined);
    setLastStatus(target);
    try {
      const updated = await api.update(data.ticket.id, { status: target, version: data.ticket.version, idempotencyKey: `support-transition:${data.ticket.id}:${target}:${data.ticket.version}` });
      replace({ ...data, ticket: updated });
      setStatus("Ticket updated");
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "Ticket could not be updated.");
    }
  };
  const sendMessage = async (body: string) => {
    if (!data) return;
    setMessagePending(true);
    setComposerError(undefined);
    setLastMessage(body);
    try {
      const message = await api.message(data.ticket.id, body);
      replace({ ...data, messages: [...data.messages, message] });
      setStatus("Reply sent");
    } catch (reason) {
      setComposerError(reason instanceof Error ? reason.message : "Reply could not be sent.");
      throw reason;
    } finally {
      setMessagePending(false);
    }
  };
  const upload = async (file: File) => { if (!data) return; const attachment = await api.uploadAttachment(data.ticket.id, file); replace({ ...data, attachments: [...data.attachments, attachment] }); };
  const download = async (attachment: SupportAttachmentView) => { if (!data) return; const blob = await api.downloadAttachment(data.ticket.id, attachment.id); const url = URL.createObjectURL(blob); URL.revokeObjectURL(url); };

  if (loading && !data) return <SystemState kind="loading" title="Loading support ticket…" />;
  if (error) return <SystemState kind="error" title={error} action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} />;
  if (!data) return null;

  const actions = <>{data.ticket.status === "assigned" ? <button className="primaryButton" type="button" onClick={() => void transition("in_progress")}>Start progress</button> : null}{data.ticket.status === "in_progress" ? <button className="secondaryButton" type="button" onClick={() => void transition("waiting_customer")}>Wait for customer</button> : null}{data.ticket.status !== "closed" ? <button className="secondaryButton" type="button" onClick={() => void transition("escalated")}>Escalate manually</button> : null}</>;

  return <section className="catalogWorkspace operationsWorkspace supportWorkspace customerWorkspace"><PageHeader eyebrow="Support ticket" title={data.ticket.subject} description={`${data.ticket.status} · version ${data.ticket.version}`} breadcrumb={[{ label: "Support", to: "/support" }, { label: data.ticket.id }]} actions={actions} />{mutationError ? <div className="pageState" role="alert"><p>{mutationError}</p><button className="secondaryButton" type="button" onClick={() => lastStatus && void transition(lastStatus)}>Retry update</button></div> : null}{status ? <div className="pageState" role="status">{status}</div> : null}<div className="detailGrid supportDetailGrid"><TicketTimeline detail={data} /><div className="supportDetailSide"><TicketContext detail={data} /><AttachmentPanel attachments={data.attachments} onUpload={(file) => void upload(file)} onDownload={(attachment) => void download(attachment)} /></div></div><section className="detailCard supportComposerPanel" aria-label="Customer reply"><h2>Reply to customer</h2>{composerError ? <div className="notice errorNotice" role="alert"><span>{composerError}</span>{lastMessage && <button className="secondaryButton" type="button" onClick={() => void sendMessage(lastMessage)}>Retry reply</button>}</div> : null}<SupportMessageComposer pending={messagePending} onSend={sendMessage} /></section></section>;
}
