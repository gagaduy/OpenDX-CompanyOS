// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
export interface AgenticFileStorage { put(key:string, content:Buffer, mediaType:string):Promise<void>; open(key:string):Promise<NodeJS.ReadableStream>; delete(key:string):Promise<void>; }
