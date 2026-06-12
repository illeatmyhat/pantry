// Measures the DESIGN.md open item: how should the ~7.8k fdc_id alias
// routes ship — physical re-export files or explicit package.json
// `exports` entries? Builds three package variants from generated/sr,
// packs each, installs each into a fresh consumer, and times alias
// resolution. Run after `npm run build`:
//
//   node scripts/measure-exports.mjs
//
// Variants:
//   A baseline   wildcard exports only, no alias routes
//   B physical   + sr/fdc/<id>.js re-export files (one per food)
//   C exportsmap + explicit "./sr/fdc/<id>" exports entries (no files)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bench = join(tmpdir(), 'pantry-exports-bench');
rmSync(bench, { recursive: true, force: true });

const manifest = JSON.parse(readFileSync(join(root, 'generated/manifest.json'), 'utf8'));
const probe = manifest[0];

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      files += 1;
      bytes += statSync(join(entry.parentPath, entry.name)).size;
    }
  }
  return { files, bytes };
}

function timed(fn) {
  const start = performance.now();
  const value = fn();
  return { ms: Math.round(performance.now() - start), value };
}

function buildVariant(name, { aliasFiles, aliasExports }) {
  const pkgDir = join(bench, name, 'pkg');
  mkdirSync(pkgDir, { recursive: true });
  cpSync(join(root, 'generated/sr'), join(pkgDir, 'sr'), { recursive: true });

  const exports = { './sr/*': './sr/*' };
  if (aliasFiles) {
    const fdcDir = join(pkgDir, 'sr', 'fdc');
    mkdirSync(fdcDir);
    for (const entry of manifest) {
      writeFileSync(
        join(fdcDir, `${entry.fdc_id}.js`),
        `export { default } from '../${entry.slug}.js';\n`,
      );
    }
  }
  if (aliasExports) {
    for (const entry of manifest) {
      exports[`./sr/fdc/${entry.fdc_id}.js`] = `./sr/${entry.slug}.js`;
    }
  }
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'pantry-bench', version: '1.0.0', type: 'module', files: ['sr'], exports }),
  );

  // --loglevel=silent: the per-file contents notice for 23k files
  // overflows the exec buffer. Sizes are measured from the artifacts.
  const pack = timed(() =>
    execSync('npm pack --loglevel=silent', {
      cwd: pkgDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const filename = pack.value.trim().split('\n').at(-1);
  const pkgStats = dirStats(pkgDir);
  const packed = {
    filename,
    size: statSync(join(pkgDir, filename)).size,
    unpackedSize: pkgStats.bytes - statSync(join(pkgDir, filename)).size,
    entryCount: pkgStats.files - 1,
  };

  const consumerDir = join(bench, name, 'consumer');
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'c', version: '1.0.0', type: 'module' }));
  const install = timed(() =>
    execSync(`npm install --no-audit --no-fund --loglevel=silent "${join(pkgDir, packed.filename)}"`, {
      cwd: consumerDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const installed = dirStats(join(consumerDir, 'node_modules'));

  const importPath =
    aliasFiles || aliasExports ? `pantry-bench/sr/fdc/${probe.fdc_id}.js` : `pantry-bench/sr/${probe.slug}.js`;
  writeFileSync(
    join(consumerDir, 'probe.mjs'),
    `import food from '${importPath}';\nif (food.fdc_id !== ${probe.fdc_id}) throw new Error('wrong module');\n`,
  );
  const resolve = timed(() => execSync('node probe.mjs', { cwd: consumerDir, stdio: ['ignore', 'pipe', 'pipe'] }));

  return {
    name,
    'pack s': (pack.ms / 1000).toFixed(1),
    'tarball MB': (packed.size / 1e6).toFixed(1),
    'unpacked MB': (packed.unpackedSize / 1e6).toFixed(1),
    'pkg files': packed.entryCount,
    'install s': (install.ms / 1000).toFixed(1),
    'node_modules MB': (installed.bytes / 1e6).toFixed(1),
    'cold import ms': resolve.ms,
  };
}

const results = [
  buildVariant('a-baseline', { aliasFiles: false, aliasExports: false }),
  buildVariant('b-physical', { aliasFiles: true, aliasExports: false }),
  buildVariant('c-exportsmap', { aliasFiles: false, aliasExports: true }),
];
console.table(results);
console.log(`bench dir: ${bench} (delete when done)`);
