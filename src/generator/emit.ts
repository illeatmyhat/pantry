import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GeneratedFood } from './assemble.js';

/**
 * Emits the generated module tree (DESIGN.md "The leaf/view law"):
 *
 *   sr/<slug>.js        core leaf (default export, plain data)
 *   sr/<slug>.extra.js  extra leaf
 *   sr/<slug>.full.js   VIEW — imports both leaves, inlines nothing
 *   manifest.json       slug ↔ fdc_id ↔ description (search CLI, aliases)
 *
 * Import-path routing (sr/<slug> → sr/<slug>.js, /full → .full.js) is the
 * package.json exports map's job, not the file layout's.
 */
export function emit(foods: readonly GeneratedFood[], outDir: string): void {
  const srDir = join(outDir, 'sr');
  mkdirSync(srDir, { recursive: true });

  for (const food of foods) {
    const { slug } = food.core;
    writeFileSync(join(srDir, `${slug}.js`), dataModule(food.core));
    writeFileSync(join(srDir, `${slug}.extra.js`), dataModule(food.extra));
    writeFileSync(
      join(srDir, `${slug}.full.js`),
      `import core from './${slug}.js';\n` +
        `import extra from './${slug}.extra.js';\n` +
        `export default { ...core, ...extra };\n`,
    );
  }

  const manifest = foods.map((f) => ({
    slug: f.core.slug,
    fdc_id: f.core.fdc_id,
    description: f.core.description,
    category: f.core.category,
  }));
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
}

function dataModule(data: unknown): string {
  return `export default ${JSON.stringify(data)};\n`;
}
