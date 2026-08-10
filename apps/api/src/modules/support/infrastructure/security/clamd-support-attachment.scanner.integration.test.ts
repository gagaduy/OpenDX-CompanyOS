// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { ClamdSupportAttachmentScanner } from "./clamd-support-attachment.scanner";

const host = process.env.CLAMAV_HOST;
const port = Number(process.env.CLAMAV_PORT ?? 3310);
const configured = host !== undefined && Number.isInteger(port) && port > 0;

describe("ClamdSupportAttachmentScanner integration", () => {
  const run = configured ? it : it.skip;

  run("accepts clean streams and rejects the EICAR test signature", async () => {
    const scanner = new ClamdSupportAttachmentScanner(host!, port, 30_000);

    await expect(scanner.scan(Readable.from([Buffer.from("clean support attachment evidence")]))).resolves.toEqual({
      status: "clean",
    });

    const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    await expect(scanner.scan(Readable.from([eicar]))).resolves.toMatchObject({
      status: "infected",
      signature: expect.stringMatching(/eicar/i),
    });
  });
});
