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
  private readonly mediaCache = new Map<string, { buffer: Buffer; contentType: string; filename: string }>();

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

  private isLocalOrMediaUrl(url: string): boolean {
    if (!url || url.startsWith("cid:") || url.startsWith("data:")) {
      return false;
    }
    if (url.startsWith("/")) {
      return true;
    }
    if (url.includes("/v1/storefront/media-content")) {
      return true;
    }
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "0.0.0.0" ||
        parsed.hostname === "api"
      );
    } catch {
      return false;
    }
  }

  private resolveFetchUrl(rawUrl: string): string {
    const port = process.env.PORT || process.env.API_PORT || "4000";
    if (rawUrl.startsWith("/")) {
      return `http://127.0.0.1:${port}${rawUrl}`;
    }
    if (rawUrl.includes("/v1/storefront/media-content")) {
      const pathAndQuery = rawUrl.slice(rawUrl.indexOf("/v1/storefront/media-content"));
      return `http://127.0.0.1:${port}${pathAndQuery}`;
    }
    try {
      const parsed = new URL(rawUrl);
      if (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "0.0.0.0" ||
        parsed.hostname === "api"
      ) {
        return `http://127.0.0.1:${port}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // fallback
    }
    return rawUrl;
  }

  private async fetchMedia(rawUrl: string): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
    const cached = this.mediaCache.get(rawUrl);
    if (cached) {
      return cached;
    }

    const fetchUrl = this.resolveFetchUrl(rawUrl);
    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        console.warn(`[SmtpEmailDispatcherAdapter] Fetch image failed with status ${response.status}: ${fetchUrl}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get("content-type") || "image/png";
      const ext = contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
        ? "gif"
        : "png";

      let filename = `product-image-${this.mediaCache.size + 1}.${ext}`;
      try {
        const urlObj = new URL(fetchUrl);
        const key = urlObj.searchParams.get("key");
        if (key) {
          const base = key.split("/").pop();
          if (base) filename = base;
        }
      } catch {
        // fallback
      }

      const item = { buffer, contentType, filename };
      if (this.mediaCache.size < 100) {
        this.mediaCache.set(rawUrl, item);
      }
      return item;
    } catch (err: any) {
      console.warn(`[SmtpEmailDispatcherAdapter] Error fetching image for inlining: ${fetchUrl}`, err?.message || err);
      return null;
    }
  }

  private async inlineLocalImages(htmlBody?: string): Promise<{
    html?: string;
    attachments: Array<{
      filename: string;
      content: Buffer;
      cid: string;
      contentType?: string;
      contentDisposition?: "inline";
    }>;
  }> {
    if (!htmlBody) {
      return { html: htmlBody, attachments: [] };
    }

    const urlRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    const localUrls = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(htmlBody)) !== null) {
      const src = match[1];
      if (this.isLocalOrMediaUrl(src)) {
        localUrls.add(src);
      }
    }

    if (localUrls.size === 0) {
      return { html: htmlBody, attachments: [] };
    }

    let modifiedHtml = htmlBody;
    const attachments: Array<{
      filename: string;
      content: Buffer;
      cid: string;
      contentType?: string;
      contentDisposition?: "inline";
    }> = [];

    let counter = 0;
    for (const rawUrl of localUrls) {
      const media = await this.fetchMedia(rawUrl);
      if (!media) {
        continue;
      }
      counter += 1;
      const cid = `img_${counter}_${Date.now()}@novacommerce.internal`;
      attachments.push({
        filename: media.filename,
        content: media.buffer,
        cid,
        contentType: media.contentType,
        contentDisposition: "inline",
      });

      const escapedRaw = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const replaceRegex = new RegExp(`src=(["'])${escapedRaw}\\1`, "g");
      modifiedHtml = modifiedHtml.replace(replaceRegex, `src="cid:${cid}"`);
    }

    return { html: modifiedHtml, attachments };
  }

  async sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const { html, attachments } = await this.inlineLocalImages(input.htmlBody);
      const mailOptions: any = {
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.textBody,
        html: html ?? input.htmlBody,
      };
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const info = await this.transporter.sendMail(mailOptions);

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

  async sendCampaignEmail(input: import("../../application/ports/email-dispatcher.port").SendCampaignEmailInput): Promise<SendEmailResult> {
    try {
      const { html, attachments } = await this.inlineLocalImages(input.htmlBody);
      const mailOptions: any = {
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.subject,
        html: html ?? input.htmlBody,
      };
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const info = await this.transporter.sendMail(mailOptions);

      return {
        messageId: info.messageId || `smtp-${randomUUID()}`,
        delivered: true,
        provider: "smtp",
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("[SmtpEmailDispatcherAdapter] sendCampaignEmail failed:", err?.message || err);
      throw err;
    }
  }
}
