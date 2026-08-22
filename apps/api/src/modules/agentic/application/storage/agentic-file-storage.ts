// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export interface AgenticFileStorage { put(key:string, content:Buffer, mediaType:string):Promise<void>; open(key:string):Promise<NodeJS.ReadableStream>; delete(key:string):Promise<void>; }
