// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailReceiverPort, IncomingCustomerEmailDto } from "../../application/ports/email-receiver.port";

export interface ImapEmailReceiverConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly pass: string;
  readonly mailbox?: string;
  readonly tlsRejectUnauthorized?: boolean;
}

export function extractCleanReplyText(fullText: string): string {
  if (!fullText) return "";
  const lines = fullText.split(/\r?\n/);
  const cleanLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^Vào\s+/i.test(trimmed) ||
      /đã\s+viết:$/i.test(trimmed) ||
      /^On\s+/i.test(trimmed) ||
      /wrote:$/i.test(trimmed) ||
      /^---+\s*(Original Message|Thư gốc)\s*---+/i.test(trimmed) ||
      /^_{10,}/.test(trimmed)
    ) {
      break;
    }
    if (trimmed.startsWith(">")) {
      continue;
    }
    cleanLines.push(line);
  }
  return cleanLines.join("\n").trim();
}

export function extractTicketReference(text: string): string | null {
  if (!text) return null;
  const uuidMatch = text.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
  if (uuidMatch) return uuidMatch[1].toLowerCase();

  const prefixMatch = text.match(/#([a-f0-9]{8})\b/i);
  if (prefixMatch) return prefixMatch[1].toLowerCase();

  return null;
}

export class ImapEmailReceiverAdapter implements EmailReceiverPort {
  constructor(private readonly config: ImapEmailReceiverConfig) {}

  private createClient(): ImapFlow {
    return new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: {
        user: this.config.user,
        pass: this.config.pass,
      },
      logger: false,
      tls: {
        rejectUnauthorized: this.config.tlsRejectUnauthorized ?? false,
      },
    });
  }

  public async fetchUnreadReplies(): Promise<IncomingCustomerEmailDto[]> {
    const client = this.createClient();
    await client.connect();
    const results: IncomingCustomerEmailDto[] = [];

    try {
      const lock = await client.getMailboxLock(this.config.mailbox || "INBOX");
      try {
        const sinceDate = new Date(Date.now() - 48 * 3600 * 1000);
        const messages = client.fetch({ since: sinceDate }, { uid: true, envelope: true, flags: true, source: true });
        for await (const message of messages) {
          if (!message.source) continue;

          const flags = message.flags ? Array.from(message.flags) : [];
          if (flags.includes("$SupportProcessed")) {
            continue;
          }

          const parsed = await simpleParser(message.source);
          const fromAddress = parsed.from?.value?.[0]?.address || this.config.user;
          const fromName = parsed.from?.value?.[0]?.name || fromAddress;
          const subject = parsed.subject || "(No Subject)";
          const rawText = parsed.text || "";

          // Skip system outbound emails
          if (fromName.toLowerCase().includes("novacommerce") && !subject.toLowerCase().startsWith("re:")) {
            continue;
          }

          const isReply = subject.toLowerCase().startsWith("re:") || subject.toLowerCase().includes("phản hồi");
          const ticketRef = extractTicketReference(subject) || extractTicketReference(rawText);

          if (!isReply && !ticketRef && !subject.toLowerCase().includes("khiếu nại")) {
            continue;
          }

          const cleanBody = extractCleanReplyText(rawText) || rawText;

          results.push({
            messageUid: String(message.uid),
            fromEmail: fromAddress,
            fromName,
            subject,
            bodyText: cleanBody,
            ticketId: ticketRef,
            receivedAt: parsed.date || new Date(),
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return results;
  }

  public async markAsRead(messageUid: string): Promise<void> {
    const client = this.createClient();
    await client.connect();
    try {
      const lock = await client.getMailboxLock(this.config.mailbox || "INBOX");
      try {
        await client.messageFlagsAdd({ uid: messageUid }, ["\\Seen", "$SupportProcessed"]);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }
}
