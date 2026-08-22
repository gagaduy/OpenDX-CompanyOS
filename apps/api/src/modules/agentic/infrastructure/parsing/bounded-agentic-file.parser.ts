// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import type { AgenticFileParser, ParsedAgenticFile } from "../../application/parsing/agentic-file-parser";
import { AGENTIC_FILE_LIMITS } from "../../domain/services/agentic-file-rules";

export type { ParsedAgenticFile } from "../../application/parsing/agentic-file-parser";

export function parseBoundedAgenticFile(format: "csv" | "txt", bytes: Uint8Array): ParsedAgenticFile {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail(); }
  if (text.includes("\0") || bytes.byteLength > AGENTIC_FILE_LIMITS.maxFileBytes) fail();
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  if (lines.length > AGENTIC_FILE_LIMITS.maxRows || lines.some((line) => new TextEncoder().encode(line).byteLength > AGENTIC_FILE_LIMITS.maxFieldBytes)) fail();
  if (format === "txt") return { rowCount: lines.length, columnCount: 1, samples: lines.slice(0, AGENTIC_FILE_LIMITS.maxSourceSamples) };
  const rows = lines.map(csvRow);
  if (rows.some((row) => row.length === 0 || row.length > AGENTIC_FILE_LIMITS.maxColumns)) fail();
  return { rowCount: rows.length, columnCount: Math.max(...rows.map((row) => row.length)), samples: lines.slice(0, AGENTIC_FILE_LIMITS.maxSourceSamples) };
}
export class BoundedAgenticFileParser implements AgenticFileParser { parse(format: "csv" | "txt", bytes: Uint8Array): ParsedAgenticFile { return parseBoundedAgenticFile(format, bytes); } }

function csvRow(line: string): string[] {
  const result: string[]=[]; let value=""; let quoted=false;
  for(let i=0;i<line.length;i+=1){ const char=line[i]!; if(char==='"'){ if(quoted&&line[i+1]==='"'){value+='"';i+=1;}else quoted=!quoted; } else if(char===","&&!quoted){result.push(value);value="";} else value+=char; }
  if(quoted) fail(); result.push(value);
  if(result.some((field)=>new TextEncoder().encode(field).byteLength>AGENTIC_FILE_LIMITS.maxFieldBytes)) fail(); return result;
}
function fail(): never { throw new AgenticApplicationError("FILE_CONTENT_INVALID", "File content is not safe for intake"); }
