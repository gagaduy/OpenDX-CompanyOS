// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticIntakeFileFormat } from "../../domain/entities/agentic-file";

export interface ParsedAgenticFile { readonly rowCount: number; readonly columnCount: number; readonly samples: readonly string[]; }
export interface AgenticFileParser { parse(format: AgenticIntakeFileFormat, bytes: Uint8Array): ParsedAgenticFile; }
