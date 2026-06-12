import { existsSync, readFileSync } from 'node:fs';
import { flag, readJsonl, root } from './lib.js';

/**
 * Progress readout for a translation batch: bar, rate, tok/s, ETA.
 *
 *   npx tsx scripts/translate/watch.ts            one snapshot
 *   npx tsx scripts/translate/watch.ts --follow   refresh every 5 s
 *   [--model qwen3.6:35b-a3b-q4_K_M] [--total 40]
 */
const MODEL = flag('model') ?? 'qwen3.6:35b-a3b-q4_K_M';
const FOLLOW = process.argv.includes('--follow');
const jsonlPath = `${root}scripts/translate/out/${MODEL.replaceAll(/[:/]/g, '_')}.jsonl`;

function totalItems(): number {
  const explicit = process.argv.indexOf('--total');
  if (explicit >= 0) return Number(process.argv[explicit + 1]);
  const samplePath = `${root}scripts/translate/out/sample.json`;
  if (existsSync(samplePath)) {
    return (JSON.parse(readFileSync(samplePath, 'utf8')) as unknown[]).length;
  }
  return 0;
}

interface Row {
  readonly slug: string;
  /** Per-item wall time — present on local-runner output only; batch rows have none. */
  readonly ms?: number;
  readonly tokens?: number;
  readonly error?: string;
}

function snapshot(): void {
  if (!existsSync(jsonlPath)) {
    console.log(`No output yet at ${jsonlPath}`);
    return;
  }
  const rows = readJsonl<Row>(jsonlPath);
  const total = totalItems() || rows.length;
  const failed = rows.filter((r) => r.error !== undefined).length;
  // Per-row ms includes queue wait when the runner uses N workers (Ollama
  // decodes one request at a time), so wall-clock rates divide by N.
  const concurrency = Number(flag('concurrency') ?? '2');
  const totalMs = rows.reduce((s, r) => s + (r.ms ?? 0), 0);
  const avgMs = totalMs / Math.max(1, rows.length) / concurrency;
  const tokens = rows.reduce((s, r) => s + (r.tokens ?? 0), 0);
  const wallSeconds = totalMs / 1000 / concurrency;
  const tokPerS = tokens / Math.max(1, wallSeconds);
  const remaining = Math.max(0, total - rows.length);
  const etaMin = (remaining * avgMs) / 60000;

  const width = 30;
  const filled = total === 0 ? 0 : Math.round((rows.length / total) * width);
  const bar = `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
  const last = rows[rows.length - 1];
  console.log(
    `${bar} ${rows.length}/${total}  ${(avgMs / 1000).toFixed(1)}s/item  ` +
      `${tokPerS.toFixed(1)} tok/s  ${failed} failed  ETA ${etaMin.toFixed(0)}m` +
      (last !== undefined ? `  last: ${last.slug}` : ''),
  );
}

snapshot();
if (FOLLOW) {
  setInterval(snapshot, 5000);
}
