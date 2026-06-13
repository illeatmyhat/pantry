import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createTarGz } from '../src/generator/tarball.js';

const dir = mkdtempSync(join(tmpdir(), 'pantry-tar-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Real-shape paths: npm tarballs prefix everything with package/, and SR
// slugs push some paths past tar's 100-byte name field (ustar prefix
// splitting) — and past 155+100 (PAX extended headers).
const LONG_SLUG =
  'lamb-australian-imported-fresh-leg-whole-shank-and-sirloin-separable-lean-and-fat-trimmed-to-1-8-fat-raw';
const VERY_LONG = `package/generated/sr/${'x'.repeat(170)}/${'y'.repeat(120)}.js`;

const entries = [
  { path: 'package/package.json', data: '{"name":"t"}\n' },
  { path: `package/generated/sr/${LONG_SLUG}.full.js`, data: 'export default 1;\n' },
  { path: VERY_LONG, data: 'export default 2;\n' },
  { path: 'package/l10n.js', data: 'export default {"name":"豚肉、塩蔵"};\n' }, // UTF-8 sizing
];

describe('createTarGz', () => {
  it('produces a tarball the system tar extracts byte-for-byte', () => {
    writeFileSync(join(dir, 'pkg.tgz'), createTarGz(entries));
    mkdirSync(join(dir, 'extract'));
    // GNU tar on Windows reads a drive-lettered path (C:\…) as a remote
    // host spec ("C:" → connect to host C), which starves the gzip child.
    // Run with cwd so the archive and dest are relative and colon-free —
    // works on both GNU tar and bsdtar.
    execFileSync('tar', ['-xzf', 'pkg.tgz', '-C', 'extract'], { cwd: dir });
    for (const entry of entries) {
      expect(readFileSync(join(dir, 'extract', entry.path), 'utf8')).toBe(entry.data);
    }
  });

  it('is byte-reproducible — fixed mtimes, no environment leakage', () => {
    const a = createTarGz(entries);
    const b = createTarGz(entries);
    expect(Buffer.compare(a, b)).toBe(0);
  });
});
