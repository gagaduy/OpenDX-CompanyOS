// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Client } from "minio";

export async function bootstrapProductMediaBucket(
  client: Client,
  bucket: string,
): Promise<void> {
  if (!(await client.bucketExists(bucket))) {
    await client.makeBucket(bucket);
  }
}
