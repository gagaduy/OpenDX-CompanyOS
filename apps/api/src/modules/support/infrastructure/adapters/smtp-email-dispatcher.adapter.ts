// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type {
  EmailDispatcherPort,
  SendEmailInput,
  SendEmailResult,
} from "../../application/ports/email-dispatcher.port";

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly pass: string;
  readonly from: string;
}

export interface SmtpEmailDispatcherAdapterOptions {
  readonly transport?: Transporter;
  readonly config?: SmtpConfig;
  readonly fromAddress?: string;
}

export class SmtpEmailDispatcherAdapter implements EmailDispatcherPort {
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(options: SmtpEmailDispatcherAdapterOptions) {
    if (options.transport) {
      this.transporter = options.transport;
      this.fromAddress = options.fromAddress || "NovaCommerce Support <support@novacommerce.vn>";
    } else if (options.config) {
      this.fromAddress = options.config.from || options.config.user;
      this.transporter = nodemailer.createTransport({
        host: options.config.host,
        port: options.config.port,
        secure: options.config.secure,
        auth: {
          user: options.config.user,
          pass: options.config.pass.replace(/\s+/g, ""),
        },
      });
    } else {
      throw new Error("SmtpEmailDispatcherAdapter requires either transport or config");
    }
  }

  async sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody,
      });

      return {
        messageId: info.messageId || `smtp-${randomUUID()}`,
        delivered: true,
        provider: "smtp",
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("[SmtpEmailDispatcherAdapter] sendMail failed:", err?.message || err);
      throw err;
    }
  }
}
