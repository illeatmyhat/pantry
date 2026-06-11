import { describe, expect, it } from 'vitest';
import { defineFood, derive, localize } from '../src/toolkit/index.js';
import { LABEL_KEYS } from '../src/toolkit/index.js';

describe('defineFood', () => {
  it('creates a standalone food SR lacks — basis required, source null', () => {
    const food = defineFood({
      name: 'shio koji',
      nutrients: { calories: 170, sodium: 9000, carbohydrate: 36, protein: 4 },
      density_g_per_ml: 1.1,
      basis: 'typical producer labels (Hanamaruki, Marukome), averaged',
    });
    expect(food.name).toBe('shio koji');
    expect(food.nutrients.calories).toBe(170);
    expect(food.density?.density_g_per_ml).toBe(1.1);
    expect(food.provenance?.source).toBeNull();
    expect(food.provenance?.basis).toMatch(/Hanamaruki/);
  });

  it('fills unstated label keys with null — cores are always structurally complete', () => {
    const food = defineFood({ name: 'water', nutrients: {}, basis: 'it is water' });
    expect(Object.keys(food.nutrients)).toHaveLength(LABEL_KEYS.length);
    expect(food.nutrients.calories).toBeNull();
    expect(food.density).toBeNull();
  });

  it('throws without a basis — everything in a defined food is stated', () => {
    expect(() => defineFood({ name: 'x', nutrients: {} } as never)).toThrow(/basis/i);
  });

  it('records stated fields as overrides', () => {
    const food = defineFood({ name: 'x', nutrients: { sodium: 100 }, basis: 'y' });
    expect(food.provenance?.overrides).toEqual(['nutrients.sodium']);
  });
});

describe('localize', () => {
  const guanciale = derive(
    defineFood({ name: 'salt pork base', nutrients: { sodium: 2684 }, basis: 'test' }),
    { name: 'guanciale' },
  );

  it('decorates a named food with a locale surface', () => {
    const ja = localize(guanciale, {
      locale: 'ja-JP',
      name: 'グアンチャーレ',
      aliases: ['豚ほほ肉の塩漬け'],
      store: '輸入食品店',
      section: '精肉',
    });
    expect(ja.locale).toBe('ja-JP');
    expect(ja.name).toBe('グアンチャーレ');
    expect(ja.aliases).toEqual(['豚ほほ肉の塩漬け']);
    expect(ja.store).toBe('輸入食品店');
    expect(ja.nutrients).toEqual(guanciale.nutrients); // nutrition rides along
  });

  it('refuses to localize an unnamed food — localization decorates NAMED foods', () => {
    const unnamed = defineFood({ name: 'x', nutrients: {}, basis: 'y' });
    const { name: _dropped, ...reallyUnnamed } = unnamed;
    expect(() => localize(reallyUnnamed, { locale: 'ja-JP', name: '×' })).toThrow(/named/i);
  });
});
