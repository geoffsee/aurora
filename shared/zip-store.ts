/**
 * Minimal store-only ZIP (no compression) for .aurora-package archives.
 * Enough for small text/binary payloads; not a general-purpose zip library.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function crc32(buf: Uint8Array): number {
  let c = 0xffff_ffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i] as number;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffff_ffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export type ZipEntry = { name: string; data: Uint8Array };

/** Build an uncompressed ZIP archive from named entries. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  const names = new Set<string>();
  for (const ent of entries) {
    if (names.has(ent.name)) throw new Error(`zip: duplicate entry ${ent.name}`);
    names.add(ent.name);
    const nameBytes = encoder.encode(ent.name);
    const data = ent.data;
    const crc = crc32(data);
    const size = data.length;

    const local = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method store
      u16(0),
      u16(0), // time/date
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra
      nameBytes,
      data,
    ]);
    locals.push(local);

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...locals, centralDir, eocd]);
}

function readU16(buf: Uint8Array, i: number): number {
  const lo = buf[i] ?? 0;
  const hi = buf[i + 1] ?? 0;
  return lo | (hi << 8);
}

function readU32(buf: Uint8Array, i: number): number {
  const b0 = buf[i] ?? 0;
  const b1 = buf[i + 1] ?? 0;
  const b2 = buf[i + 2] ?? 0;
  const b3 = buf[i + 3] ?? 0;
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

/** Parse a store-only (or deflated-unsupported) ZIP; rejects compressed entries. */
export function unzipStore(buf: Uint8Array): ZipEntry[] {
  // Find EOCD (last 22+ bytes; comment length at end)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (readU32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: EOCD not found');

  const count = readU16(buf, eocd + 10);
  const disk = readU16(buf, eocd + 4);
  const centralDisk = readU16(buf, eocd + 6);
  const diskCount = readU16(buf, eocd + 8);
  if (disk !== 0 || centralDisk !== 0 || diskCount !== count) {
    throw new Error('zip: multi-disk archives not supported');
  }
  let centralOffset = readU32(buf, eocd + 16);
  const out: ZipEntry[] = [];
  const names = new Set<string>();

  for (let n = 0; n < count; n++) {
    if (readU32(buf, centralOffset) !== 0x02014b50) {
      throw new Error('zip: bad central directory signature');
    }
    const method = readU16(buf, centralOffset + 10);
    const flags = readU16(buf, centralOffset + 8);
    const expectedCrc = readU32(buf, centralOffset + 16);
    const compSize = readU32(buf, centralOffset + 20);
    const plainSize = readU32(buf, centralOffset + 24);
    const nameLen = readU16(buf, centralOffset + 28);
    const extraLen = readU16(buf, centralOffset + 30);
    const commentLen = readU16(buf, centralOffset + 32);
    const localHeaderOffset = readU32(buf, centralOffset + 42);
    const name = decoder.decode(buf.subarray(centralOffset + 46, centralOffset + 46 + nameLen));

    if (names.has(name)) throw new Error(`zip: duplicate entry ${name}`);
    names.add(name);
    if (!name || name.startsWith('/') || name.startsWith('\\') || name.includes('\\')) {
      throw new Error(`zip: unsafe entry path ${name || '<empty>'}`);
    }
    const parts = name.split('/');
    if (parts.some((part) => part === '' || part === '.' || part === '..')) {
      throw new Error(`zip: unsafe entry path ${name}`);
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0008) !== 0) {
      throw new Error(`zip: encrypted/data-descriptor entries not supported (${name})`);
    }
    if (method !== 0) {
      throw new Error(`zip: compressed entries not supported (method ${method} for ${name})`);
    }
    if (compSize !== plainSize) throw new Error(`zip: invalid stored size for ${name}`);

    if (readU32(buf, localHeaderOffset) !== 0x04034b50) {
      throw new Error(`zip: bad local header for ${name}`);
    }
    if (
      readU16(buf, localHeaderOffset + 6) !== flags ||
      readU16(buf, localHeaderOffset + 8) !== method ||
      readU32(buf, localHeaderOffset + 14) !== expectedCrc ||
      readU32(buf, localHeaderOffset + 18) !== compSize ||
      readU32(buf, localHeaderOffset + 22) !== plainSize
    ) {
      throw new Error(`zip: local/central metadata mismatch for ${name}`);
    }
    const localNameLen = readU16(buf, localHeaderOffset + 26);
    const localExtraLen = readU16(buf, localHeaderOffset + 28);
    const localName = decoder.decode(
      buf.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLen),
    );
    if (localName !== name) throw new Error(`zip: local/central name mismatch for ${name}`);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > buf.byteLength) throw new Error(`zip: truncated entry ${name}`);
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (crc32(data) !== expectedCrc) throw new Error(`zip: CRC mismatch for ${name}`);

    out.push({ name, data: new Uint8Array(data) });
    centralOffset += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

export function zipTextEntries(files: Record<string, string>): Uint8Array {
  return zipStore(
    Object.entries(files).map(([name, text]) => ({
      name,
      data: encoder.encode(text),
    })),
  );
}

export function unzipTextEntries(buf: Uint8Array): Record<string, string> {
  const entries = unzipStore(buf);
  const out: Record<string, string> = {};
  for (const e of entries) {
    out[e.name] = decoder.decode(e.data);
  }
  return out;
}
