// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parseBoundedAgenticFile } from "./bounded-agentic-file.parser";
const bytes=(value:string)=>new TextEncoder().encode(value);
describe("bounded Agentic file parser",()=>{
  it("keeps CSV formulas and instructions inert",()=>expect(parseBoundedAgenticFile("csv",bytes('name,note\na,=IMPORT("x")'))).toEqual({rowCount:2,columnCount:2,samples:['name,note','a,=IMPORT("x")']}));
  it("rejects NUL and invalid CSV quotes",()=>{expect(()=>parseBoundedAgenticFile("txt",bytes("a\0b"))).toThrow();expect(()=>parseBoundedAgenticFile("csv",bytes('"unterminated'))).toThrow();});
});
