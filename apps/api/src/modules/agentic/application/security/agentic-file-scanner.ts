// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export type AgenticFileScanResult={readonly status:"clean"}|{readonly status:"infected";readonly signature:string};
export interface AgenticFileScanner { scan(content:NodeJS.ReadableStream):Promise<AgenticFileScanResult>; }
