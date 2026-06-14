import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Emits the per-locale package manifests and patches the core package.json
 * — the locale-splitting setup (DESIGN.md "Locale scaling path"):
 *
 *   <root>/package.json                      core: fdc alias exports
 *                                            (measured: exports-map entries
 *                                            beat physical files) + every
 *                                            locale package as an OPTIONAL
 *                                            peer — npm's spelling of pip
 *                                            extras.
 *   generated/l10n/<tag>/package.json        @…/pantry-l10n-<tag>: ships
 *                                            only its sr/ tree, core peer
 *                                            pinned in version lockstep.
 *
 * Locale views import core leaves via the bare specifier
 * (`@…/pantry/sr/<slug>`), so each generated/l10n/<tag>/ directory is
 * publishable as-is.
 */
export interface PackageManifestEntry {
  readonly slug: string;
  readonly fdc_id: number;
}

export interface PackagePlan {
  readonly coreName: string;
  readonly version: string;
  readonly manifest: readonly PackageManifestEntry[];
  readonly locales: readonly { readonly tag: string }[];
}

/** npm names are lowercase: ja-JP → @…/pantry-l10n-ja-jp. */
export function localePackageName(coreName: string, tag: string): string {
  return `${coreName}-l10n-${tag.toLowerCase()}`;
}

function aliasExports(manifest: readonly PackageManifestEntry[], prefix: string): Record<string, string> {
  return Object.fromEntries(
    [...manifest]
      .sort((a, b) => a.fdc_id - b.fdc_id)
      .map((entry) => [`./sr/fdc/${entry.fdc_id}`, `${prefix}/${entry.slug}.js`]),
  );
}

export function localePackageJson(plan: PackagePlan, tag: string): object {
  return {
    name: localePackageName(plan.coreName, tag),
    version: plan.version,
    description: `${tag} locale surfaces for ${plan.coreName} — strings leaves and composed views per food.`,
    license: 'MIT',
    type: 'module',
    files: ['sr', 'labels.js', 'nutrients.js', 'nutrients.d.ts', 'types', 'search.json'],
    exports: {
      './labels': './labels.js',
      './search': './search.json',
      './nutrients': { types: './nutrients.d.ts', default: './nutrients.js' },
      // The `types` condition narrows nutrient keys for autocomplete; a single
      // static .d.ts per view serves every slug (DESIGN.md name-keyed access).
      // fdc alias routes stay plain string targets — the slug routes are the
      // typed surface; typing 7,793 aliases would double the manifest.
      './sr/*/full': { types: './types/full.d.ts', default: './sr/*.full.js' },
      './sr/*': { types: './types/core.d.ts', default: './sr/*.js' },
      ...aliasExports(plan.manifest, './sr'),
    },
    // Lockstep pin: locale strings reference core slugs, which are frozen
    // within a major (/sr/** never changes within a major).
    peerDependencies: { [plan.coreName]: plan.version },
  };
}

export function patchCorePackage(pkg: Record<string, unknown>, plan: PackagePlan): object {
  const existingExports = (pkg['exports'] ?? {}) as Record<string, unknown>;
  const staticExports = Object.fromEntries(
    Object.entries(existingExports).filter(([key]) => !key.startsWith('./sr/fdc/')),
  );
  const localeNames = plan.locales.map((l) => localePackageName(plan.coreName, l.tag));
  return {
    ...pkg,
    files: [
      'dist',
      'generated/sr',
      'generated/manifest.json',
      'generated/nutrients.js',
      'generated/nutrients.d.ts',
      'generated/nutrient-keys.js',
      'generated/types',
    ],
    exports: { ...staticExports, ...aliasExports(plan.manifest, './generated/sr') },
    peerDependencies: {
      ...((pkg['peerDependencies'] ?? {}) as Record<string, string>),
      ...Object.fromEntries(localeNames.map((name) => [name, plan.version])),
    },
    peerDependenciesMeta: {
      ...((pkg['peerDependenciesMeta'] ?? {}) as Record<string, unknown>),
      ...Object.fromEntries(localeNames.map((name) => [name, { optional: true }])),
    },
  };
}

/**
 * Rewrites the core package.json and, when outDir is given (loose-tree
 * mode), writes locale package.jsons into outDir/l10n/<tag>/. Tarball
 * mode (build-packages.ts) skips the loose writes — the manifests go
 * straight into the tarballs.
 */
export function emitPackages(plan: PackagePlan, rootPkgPath: string, outDir?: string): void {
  if (outDir !== undefined) {
    for (const locale of plan.locales) {
      writeFileSync(
        join(outDir, 'l10n', locale.tag, 'package.json'),
        `${JSON.stringify(localePackageJson(plan, locale.tag), null, 2)}\n`,
      );
    }
  }
  const core = JSON.parse(readFileSync(rootPkgPath, 'utf8')) as Record<string, unknown>;
  writeFileSync(rootPkgPath, `${JSON.stringify(patchCorePackage(core, plan), null, 2)}\n`);
}
