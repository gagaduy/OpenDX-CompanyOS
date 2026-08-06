// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { sessionSchema } from "../schemas/customer-session.schema";
export type CustomerSession = z.infer<typeof sessionSchema>;
