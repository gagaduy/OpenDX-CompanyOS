// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportAttachmentView, SupportMessageView, SupportTicketDetailView, SupportTicketPageView, SupportTicketView } from "../types/support.types";

export const mapTicketPage = (value: SupportTicketPageView): SupportTicketPageView => ({ ...value, items: value.items.map(mapTicket) });
export const mapTicket = (value: SupportTicketView): SupportTicketView => ({ ...value });
export const mapDetail = (value: SupportTicketDetailView): SupportTicketDetailView => ({ ...value, ticket: mapTicket(value.ticket), messages: value.messages.map(mapMessage), events: value.events.map((event) => ({ ...event })), attachments: value.attachments.map(mapAttachment) });
export const mapMessage = (value: SupportMessageView): SupportMessageView => ({ ...value });
export const mapAttachment = (value: SupportAttachmentView): SupportAttachmentView => ({ ...value });
