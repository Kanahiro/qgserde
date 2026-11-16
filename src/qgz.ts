/**
 * `.qgz` archives: a ZIP holding the `.qgs` project and companion files, such
 * as the `.qgd` auxiliary storage database. Compression uses the platform's
 * CompressionStream, so no runtime dependency is needed.
 */
import { QgsError } from "./errors.ts";
import { parseQgs, serializeQgs } from "./project.ts";
import type { QgsProject, SerializeOptions } from "./types.ts";

/** Contents of a `.qgz` archive. */
export interface QgzArchive {
  /** The project. */
  project: QgsProject;
  /** File name of the project inside the archive, such as `map.qgs`. */
  projectFile: string;
  /** Other archive files by name, such as `map.qgd`, kept byte for byte. */
  files: Record<string, Uint8Array>;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const UTF8_FLAG = 0x0800;

function fail(message: string): never {
  throw new QgsError("INVALID_ARCHIVE", message);
}

let crcTable: Uint32Array | undefined;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data)
    crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function transform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

interface Entry {
  name: string;
  data: Uint8Array;
}

async function readZip(bytes: Uint8Array): Promise<Entry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === END) {
      end = i;
      break;
    }
  if (end < 0) fail("Not a ZIP archive");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff)
    fail("ZIP64 archives are not supported");
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL)
      fail("Corrupt ZIP central directory");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) fail(`Encrypted archive entry: ${name}`);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL)
      fail(`Corrupt ZIP entry: ${name}`);
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (start + compressedSize > bytes.length)
      fail(`Truncated ZIP entry: ${name}`);
    const raw = bytes.subarray(start, start + compressedSize);
    if (name.endsWith("/")) continue;
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8)
      try {
        data = await transform(raw, new DecompressionStream("deflate-raw"));
      } catch (error) {
        throw new QgsError("INVALID_ARCHIVE", `Corrupt ZIP entry: ${name}`, {
          cause: error,
        });
      }
    else fail(`Unsupported ZIP compression method ${method}: ${name}`);
    if (data.length !== size || crc32(data) !== crc)
      fail(`ZIP entry checksum mismatch: ${name}`);
    entries.push({ name, data });
  }
  return entries;
}

async function writeZip(entries: Entry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const compressed = await transform(
      entry.data,
      new CompressionStream("deflate-raw"),
    );
    const crc = crc32(entry.data);
    if (compressed.length > 0xfffffffe || entry.data.length > 0xfffffffe)
      fail(`Archive entry too large: ${entry.name}`);
    const header = new Uint8Array(30 + name.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, LOCAL, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, UTF8_FLAG, true);
    h.setUint16(8, 8, true);
    // DOS date 1980-01-01 keeps archives byte-for-byte reproducible.
    h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, compressed.length, true);
    h.setUint32(22, entry.data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, CENTRAL, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, UTF8_FLAG, true);
    c.setUint16(10, 8, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, compressed.length, true);
    c.setUint32(24, entry.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(header, compressed);
    centrals.push(central);
    offset += header.length + compressed.length;
  }
  const directorySize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, END, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const result = new Uint8Array(offset + directorySize + end.length);
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}

/**
 * Read a `.qgz` archive.
 *
 * @param data - Archive bytes.
 * @returns The project, its file name in the archive, and the other files.
 * @throws {@link QgsError} `INVALID_ARCHIVE` for a malformed, encrypted, or
 * ZIP64 archive, or one without exactly one `.qgs` file; parsing errors of
 * {@link parseQgs} for the project.
 * @example
 * ```ts
 * const { project, projectFile, files } = await parseQgz(bytes);
 * project.title = "Edited";
 * const output = await serializeQgz({ project, projectFile, files }, { version: "4.2" });
 * ```
 */
export async function parseQgz(data: Uint8Array): Promise<QgzArchive> {
  if (!(data instanceof Uint8Array))
    throw new QgsError("INVALID_ARCHIVE", "Archive data must be a Uint8Array");
  const entries = await readZip(data);
  const projects = entries.filter((entry) =>
    entry.name.toLowerCase().endsWith(".qgs"),
  );
  if (projects.length !== 1)
    fail(`Expected one .qgs file in the archive, found ${projects.length}`);
  const [main] = projects as [Entry];
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries)
    if (entry !== main)
      Object.defineProperty(files, entry.name, {
        value: entry.data,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(main.data);
  } catch (error) {
    throw new QgsError("INVALID_XML", "The project file is not UTF-8", {
      cause: error,
    });
  }
  return { project: parseQgs(xml), projectFile: main.name, files };
}

/**
 * Write a `.qgz` archive for a QGIS version.
 *
 * @param archive - The project, and optionally its file name (default
 * `project.qgs`) and companion files to include unchanged.
 * @param options - Required output version, as for {@link serializeQgs}.
 * @returns Archive bytes.
 * @throws {@link QgsError} `INVALID_ARCHIVE` for an invalid file name or
 * file data; errors of {@link serializeQgs} for the project.
 */
export async function serializeQgz(
  archive: Pick<QgzArchive, "project"> & Partial<QgzArchive>,
  options: SerializeOptions,
): Promise<Uint8Array> {
  const projectFile = archive.projectFile ?? "project.qgs";
  if (
    typeof projectFile !== "string" ||
    !projectFile.toLowerCase().endsWith(".qgs")
  )
    fail("The project file name must end with .qgs");
  const xml = serializeQgs(archive.project, options);
  const entries: Entry[] = [
    { name: projectFile, data: new TextEncoder().encode(xml) },
  ];
  for (const [name, data] of Object.entries(archive.files ?? {})) {
    if (!(data instanceof Uint8Array))
      fail(`Archive file ${name} must be a Uint8Array`);
    if (!name || name.toLowerCase().endsWith(".qgs"))
      fail(`Invalid archive file name: ${JSON.stringify(name)}`);
    entries.push({ name, data });
  }
  return writeZip(entries);
}
