import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecords, readBaseline, writeBaseline } from '../scripts/translate/baseline.js';

const records = [
  {
    slug: 'pork-cured-salt-pork-raw',
    fdc_id: 168287,
    description: 'Pork, cured, salt pork, raw',
    category: 'Pork Products',
    result: {
      brand: null,
      'ja-JP': {
        name: '豚肉、塩蔵、ソルトポーク、生',
        aliases: ['ソルトポーク'],
        errand: { store: 'specialty', section: 'meat' },
        notes: ['日本では流通が少ない。'],
      },
    },
  },
  {
    slug: 'failed-food',
    fdc_id: 1,
    description: 'Failed',
    category: 'X',
    error: 'batch result: errored',
  },
];

describe('baseline store', () => {
  it('round-trips records through per-food YAML files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pantry-baseline-'));
    try {
      const { written, skipped } = writeBaseline(records, dir);
      expect(written).toBe(1);
      expect(skipped).toBe(1); // failed rows are not baseline — retry them instead
      const back = readBaseline(dir);
      expect(back).toEqual([records[0]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stores foods as readable block YAML, not packed lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pantry-baseline-'));
    try {
      writeBaseline(records, dir);
      const text = readFileSync(join(dir, 'pork-cured-salt-pork-raw.yaml'), 'utf8');
      expect(text).toContain('ja-JP:\n');
      expect(text).toContain('name: 豚肉、塩蔵、ソルトポーク、生');
      expect(text.split('\n').length).toBeGreaterThan(8); // block style, one fact per line
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops transient generation metadata (tokens, ms) — wire details are not baseline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pantry-baseline-'));
    try {
      const wireRecord = { ...records[0], tokens: 393, ms: 1200 };
      writeBaseline([wireRecord], dir);
      const back = readBaseline(dir);
      expect(back[0]).toEqual(records[0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadRecords reads either format: a .jsonl file or a baseline directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pantry-baseline-'));
    try {
      writeBaseline(records, dir);
      expect(loadRecords(dir)).toEqual([records[0]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
