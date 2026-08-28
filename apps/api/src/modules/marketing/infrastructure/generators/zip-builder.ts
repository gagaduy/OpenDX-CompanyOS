// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

export function crc32(buf: Buffer): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]!) & 0xff]!;
  }
  return (crc ^ -1) >>> 0;
}

export interface ZipFileEntry {
  readonly path: string;
  readonly content: string | Buffer;
}

export function buildZip(entries: readonly ZipFileEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = typeof entry.content === "string" ? Buffer.from(entry.content, "utf-8") : entry.content;
    const nameBuffer = Buffer.from(entry.path, "utf-8");
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + name length + data length)
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0); // Local header signature
    local.writeUInt16LE(20, 4); // Version needed (2.0)
    local.writeUInt16LE(0, 6); // General purpose flags
    local.writeUInt16LE(0, 8); // Compression method (0 = store)
    local.writeUInt16LE(0, 10); // Mod time
    local.writeUInt16LE(0, 12); // Mod date
    local.writeUInt32LE(crc, 14); // CRC-32
    local.writeUInt32LE(size, 18); // Compressed size
    local.writeUInt32LE(size, 22); // Uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26); // File name length
    local.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(local, 30);

    localHeaders.push(local, data);

    // Central directory file header (46 bytes + name length)
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0); // Central file header signature
    central.writeUInt16LE(20, 4); // Version made by
    central.writeUInt16LE(20, 6); // Version needed
    central.writeUInt16LE(0, 8); // Flags
    central.writeUInt16LE(0, 10); // Compression method
    central.writeUInt16LE(0, 12); // Mod time
    central.writeUInt16LE(0, 14); // Mod date
    central.writeUInt32LE(crc, 16); // CRC-32
    central.writeUInt32LE(size, 20); // Compressed size
    central.writeUInt32LE(size, 24); // Uncompressed size
    central.writeUInt16LE(nameBuffer.length, 28); // File name length
    central.writeUInt16LE(0, 30); // Extra field length
    central.writeUInt16LE(0, 32); // File comment length
    central.writeUInt16LE(0, 34); // Disk number start
    central.writeUInt16LE(0, 36); // Internal file attributes
    central.writeUInt32LE(0, 38); // External file attributes
    central.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBuffer.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + data.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of central directory record (22 bytes)
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  endRecord.writeUInt16LE(0, 4); // Number of this disk
  endRecord.writeUInt16LE(0, 6); // Disk where central directory starts
  endRecord.writeUInt16LE(entries.length, 8); // Number of central dir records on this disk
  endRecord.writeUInt16LE(entries.length, 10); // Total number of central dir records
  endRecord.writeUInt32LE(centralDirSize, 12); // Size of central directory
  endRecord.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  endRecord.writeUInt16LE(0, 20); // ZIP comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}
