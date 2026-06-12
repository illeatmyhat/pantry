import { describe, expect, it } from 'vitest';
import { LOCALES } from '../scripts/translate/locales.js';
import { SCHEMA, SYSTEM_PROMPT, validateShape } from '../scripts/translate/task.js';

/** A minimal valid result covering every locale in the table. */
function validResult(): Record<string, unknown> {
  const result: Record<string, unknown> = { brand: null };
  for (const spec of LOCALES) {
    result[spec.tag] = {
      ...(spec.canonical === true ? {} : { name: 'x' }),
      aliases: [],
      errand: { store: 'primary', section: spec.sections[0] },
      notes: [],
    };
  }
  return result;
}

const someTag = LOCALES[0]?.tag ?? 'en-US';

describe('task contract — errand', () => {
  it('accepts a fully-populated shape', () => {
    expect(() => validateShape(validResult())).not.toThrow();
  });

  it('accepts errand: null — non-retail foods fit no store section (decided 2026-06-12)', () => {
    const result = validResult();
    for (const spec of LOCALES) {
      (result[spec.tag] as Record<string, unknown>)['errand'] = null;
    }
    expect(() => validateShape(result)).not.toThrow();
  });

  it('rejects a missing errand — null is a value, absence is not', () => {
    const result = validResult();
    delete (result[someTag] as Record<string, unknown>)['errand'];
    expect(() => validateShape(result)).toThrow(/errand/);
  });

  it('rejects a section outside the locale vocabulary', () => {
    const result = validResult();
    (result[someTag] as Record<string, unknown>)['errand'] = {
      store: 'primary',
      section: 'restaurant', // parking slugs were rejected with the nullable decision
    };
    expect(() => validateShape(result)).toThrow(/section/);
  });

  it('rejects an unknown store', () => {
    const result = validResult();
    (result[someTag] as Record<string, unknown>)['errand'] = {
      store: 'mall',
      section: LOCALES[0]?.sections[0],
    };
    expect(() => validateShape(result)).toThrow(/store/);
  });

  it('expresses errand as nullable in the schema for every locale', () => {
    const properties = (SCHEMA as { properties: Record<string, unknown> }).properties;
    for (const spec of LOCALES) {
      const locale = properties[spec.tag] as { properties: { errand: unknown } };
      const errand = locale.properties.errand as { anyOf?: Array<{ type?: string }> };
      expect(errand.anyOf?.some((variant) => variant.type === 'null')).toBe(true);
    }
  });

  it('instructs the model on the null case in the prompt', () => {
    expect(SYSTEM_PROMPT).toContain('null');
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/restaurant|menu item/);
  });
});
