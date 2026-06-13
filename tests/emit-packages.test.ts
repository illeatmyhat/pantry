import { describe, expect, it } from 'vitest';
import { localePackageJson, localePackageName, patchCorePackage } from '../src/generator/emit-packages.js';

const manifest = [
  { slug: 'abiyuch-raw', fdc_id: 167782, description: 'Abiyuch, raw', category: 'Fruits' },
  { slug: 'butter-salted', fdc_id: 173410, description: 'Butter, salted', category: 'Dairy' },
];
const locales = [{ tag: 'en-US' }, { tag: 'ja-JP' }];
const opts = { coreName: '@illeatmyhat/pantry', version: '0.0.0', manifest, locales };

describe('localePackageJson', () => {
  it('derives the npm-legal package name from the locale tag', () => {
    expect(localePackageName('@illeatmyhat/pantry', 'ja-JP')).toBe(
      '@illeatmyhat/pantry-l10n-ja-jp',
    );
  });

  it('builds a publishable locale manifest: exports, files, core peer in lockstep', () => {
    const pkg = localePackageJson(opts, 'ja-JP') as {
      name: string;
      type: string;
      files: string[];
      exports: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('@illeatmyhat/pantry-l10n-ja-jp');
    expect(pkg.type).toBe('module');
    expect(pkg.files).toEqual(['sr']);
    expect(pkg.exports['./sr/*']).toBe('./sr/*.js');
    expect(pkg.exports['./sr/*/full']).toBe('./sr/*.full.js');
    // fdc alias routes — exports-map entries, the measured decision
    expect(pkg.exports['./sr/fdc/167782']).toBe('./sr/abiyuch-raw.js');
    expect(pkg.peerDependencies['@illeatmyhat/pantry']).toBe('0.0.0');
  });
});

describe('patchCorePackage', () => {
  const core = {
    name: '@illeatmyhat/pantry',
    version: '0.0.0',
    exports: {
      '.': { types: './dist/toolkit/index.d.ts', default: './dist/toolkit/index.js' },
      './sr/*/full': './generated/sr/*.full.js',
      './sr/*': './generated/sr/*.js',
      './sr/fdc/999999': './generated/sr/stale-alias.js', // stale — must be regenerated
      './manifest.json': './generated/manifest.json',
    },
  };

  it('regenerates fdc alias exports from the manifest, preserving static entries', () => {
    const patched = patchCorePackage(core, opts) as { exports: Record<string, unknown> };
    expect(patched.exports['./sr/fdc/167782']).toBe('./generated/sr/abiyuch-raw.js');
    expect(patched.exports['./sr/fdc/173410']).toBe('./generated/sr/butter-salted.js');
    expect(patched.exports['./sr/fdc/999999']).toBeUndefined(); // stale alias dropped
    expect(patched.exports['./sr/*']).toBe('./generated/sr/*.js'); // static preserved
    expect(patched.exports['.']).toEqual(core.exports['.']);
  });

  it('declares every locale package as an optional peer in version lockstep', () => {
    const patched = patchCorePackage(core, opts) as {
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional: boolean }>;
    };
    expect(patched.peerDependencies['@illeatmyhat/pantry-l10n-ja-jp']).toBe('0.0.0');
    expect(patched.peerDependenciesMeta['@illeatmyhat/pantry-l10n-en-us']).toEqual({
      optional: true,
    });
  });

  it('scopes the published files so locale trees never ride in the core tarball', () => {
    const patched = patchCorePackage(core, opts) as { files: string[] };
    expect(patched.files).toContain('generated/sr');
    expect(patched.files).not.toContain('generated');
    expect(patched.files.some((f) => f.includes('l10n'))).toBe(false);
  });
});
