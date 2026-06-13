import { gzipSync } from 'node:zlib';

/**
 * Minimal deterministic tar.gz writer — lets the build stream package
 * contents straight into publishable tarballs instead of materializing
 * tens of thousands of loose files (DESIGN.md, decided 2026-06-12).
 *
 * ustar with PAX extended headers for paths that outgrow the 100-byte
 * name field (long SR slugs do). Fixed mtime (npm's own epoch,
 * 1985-10-26) and zeroed ownership keep output byte-reproducible —
 * `anyone can rebuild byte-identical output` extends to the tarballs.
 */
export interface TarEntry {
  readonly path: string;
  readonly data: string | Uint8Array;
}

const MTIME = 499162500; // 1985-10-26T08:15:00Z, npm's reproducible-build epoch
const BLOCK = 512;

function octal(value: number, width: number): Buffer {
  const field = Buffer.alloc(width, 0);
  field.write(`${value.toString(8).padStart(width - 1, '0')}`, 0, 'ascii');
  return field;
}

function header(name: string, prefix: string, size: number, typeflag: string): Buffer {
  const block = Buffer.alloc(BLOCK, 0);
  block.write(name, 0, 100, 'ascii');
  octal(0o644, 8).copy(block, 100); // mode
  octal(0, 8).copy(block, 108); // uid
  octal(0, 8).copy(block, 116); // gid
  octal(size, 12).copy(block, 124);
  octal(MTIME, 12).copy(block, 136);
  block.fill(' ', 148, 156); // checksum placeholder
  block.write(typeflag, 156, 1, 'ascii');
  block.write('ustar', 257, 'ascii'); // magic (NUL-terminated by the zero fill)
  block.write('00', 263, 'ascii'); // version
  block.write(prefix, 345, 155, 'ascii');
  let sum = 0;
  for (const byte of block) sum += byte;
  const checksum = Buffer.alloc(8, 0);
  checksum.write(`${sum.toString(8).padStart(6, '0')}\0 `, 0, 'ascii');
  checksum.copy(block, 148);
  return block;
}

function padded(data: Buffer): Buffer {
  const remainder = data.length % BLOCK;
  return remainder === 0 ? data : Buffer.concat([data, Buffer.alloc(BLOCK - remainder, 0)]);
}

/** ustar name/prefix split at a '/', or null when only PAX can represent the path. */
function splitName(path: string): { name: string; prefix: string } | null {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  for (let i = path.length - 1; i > 0; i -= 1) {
    if (path[i] !== '/') continue;
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) {
      return { name, prefix };
    }
  }
  return null;
}

function paxHeader(path: string): Buffer {
  // PAX record: "<len> path=<value>\n" where <len> counts the whole record.
  const body = ` path=${path}\n`;
  let len = body.length + 1;
  while (`${len}`.length + body.length !== len) len = `${len}`.length + body.length;
  const record = Buffer.from(`${len}${body}`, 'utf8');
  return Buffer.concat([
    header(`PaxHeader/${path.slice(0, 89)}`, '', record.length, 'x'),
    padded(record),
  ]);
}

export function createTarGz(entries: Iterable<TarEntry>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : Buffer.from(entry.data);
    const split = splitName(entry.path);
    if (split === null) {
      blocks.push(paxHeader(entry.path));
      blocks.push(header(entry.path.slice(0, 100), '', data.length, '0'));
    } else {
      blocks.push(header(split.name, split.prefix, data.length, '0'));
    }
    blocks.push(padded(data));
  }
  blocks.push(Buffer.alloc(BLOCK * 2, 0)); // end-of-archive
  // Fixed gzip mtime (header byte 4-7 already zero with level option object)
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}
