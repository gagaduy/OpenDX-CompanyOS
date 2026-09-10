// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import type { ReadMarketingPublicMediaInput } from "../../application/services/interfaces/marketing-public-media.service";

const lowercaseDigest = z.string().regex(/^[a-f0-9]{64}$/);

const publicMediaRequestSchema = z.object({
  params: z.object({
    assetId: z.uuid(),
  }).strict(),
  query: z.object({
    v: z.literal("1"),
    digest: lowercaseDigest,
    policy: lowercaseDigest,
    outputDigest: lowercaseDigest,
    expires: z.string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().safe()),
    signature: lowercaseDigest,
  }).strict(),
});

export function parseMarketingPublicMediaRequest(input: {
  readonly params: unknown;
  readonly query: unknown;
}): ReadMarketingPublicMediaInput {
  const parsed = publicMediaRequestSchema.parse(input);
  return {
    assetId: parsed.params.assetId,
    sourceDigest: parsed.query.digest,
    policy: parsed.query.policy,
    outputDigest: parsed.query.outputDigest,
    expires: parsed.query.expires,
    signature: parsed.query.signature,
  };
}
