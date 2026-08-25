// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { connect } from "node:net";
import type { SupportAttachmentScanner, SupportAttachmentScanResult } from "../../application/security/support-attachment-scanner";
import { SupportApplicationError } from "../../application/services/support-application.error";

export class ClamdSupportAttachmentScanner implements SupportAttachmentScanner {
  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs: number) {}

  async scan(content: NodeJS.ReadableStream): Promise<SupportAttachmentScanResult> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new SupportApplicationError("ATTACHMENT_SCAN_FAILED", "Attachment scan failed"));
      };
      socket.setTimeout(this.timeoutMs, fail);
      socket.on("error", fail);
      socket.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      socket.on("end", () => {
        if (settled) return;
        settled = true;
        const response = Buffer.concat(chunks).toString("utf8").replace(/\0$/, "").trim();
        if (response.endsWith(": OK")) resolve({ status: "clean" });
        else {
          const match = /^stream: (.{1,200}) FOUND$/.exec(response);
          if (match === null) reject(new SupportApplicationError("ATTACHMENT_SCAN_FAILED", "Attachment scan failed"));
          else resolve({ status: "infected", signature: match[1] });
        }
      });
      socket.on("connect", async () => {
        socket.write("zINSTREAM\0");
        try {
          for await (const chunk of content) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(buffer.byteLength);
            socket.write(size);
            socket.write(buffer);
          }
          socket.end(Buffer.alloc(4));
        } catch {
          fail();
        }
      });
    });
  }
}
