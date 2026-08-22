// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createServer } from "node:net";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { ClamdSupportAttachmentScanner } from "./clamd-support-attachment.scanner";

describe("ClamdSupportAttachmentScanner", () => {
  const servers: Array<{ close(callback?: () => void): void }> = [];
  afterEach(async () => {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(resolve))));
    servers.length = 0;
  });

  it("streams zINSTREAM chunks and parses clean and infected responses", async () => {
    const clean = await fakeClamd("stream: OK\0");
    const scanner = new ClamdSupportAttachmentScanner("127.0.0.1", clean.port, 1_000);

    await expect(scanner.scan(Readable.from([Buffer.from("abc")]))).resolves.toEqual({ status: "clean" });
    expect(clean.payload).toEqual(Buffer.concat([
      Buffer.from("zINSTREAM\0"),
      Buffer.from([0, 0, 0, 3]), Buffer.from("abc"),
      Buffer.from([0, 0, 0, 0]),
    ]));

    const infected = await fakeClamd("stream: Eicar-Test-Signature FOUND\0");
    await expect(new ClamdSupportAttachmentScanner("127.0.0.1", infected.port, 1_000).scan(Readable.from(["x"]))).resolves.toEqual({
      status: "infected", signature: "Eicar-Test-Signature",
    });
  });

  it("fails closed on malformed responses and timeouts without echoing payload", async () => {
    const malformed = await fakeClamd("unexpected\0");
    await expect(new ClamdSupportAttachmentScanner("127.0.0.1", malformed.port, 1_000).scan(Readable.from(["secret-payload"]))).rejects.toMatchObject({ code: "ATTACHMENT_SCAN_FAILED" });

    const timeout = await fakeClamd(undefined);
    await expect(new ClamdSupportAttachmentScanner("127.0.0.1", timeout.port, 10).scan(Readable.from(["secret-payload"]))).rejects.toMatchObject({ code: "ATTACHMENT_SCAN_FAILED" });
  });

  async function fakeClamd(response: string | undefined) {
    let payload = Buffer.alloc(0);
    const server = createServer(socket => {
      socket.on("data", chunk => { payload = Buffer.concat([payload, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]); });
      socket.on("end", () => { if (response !== undefined) socket.end(response); });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    return { port: (server.address() as { port: number }).port, get payload() { return payload; } };
  }
});
