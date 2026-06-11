import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/generator/load.js';

// One load for the whole file — parsing the 36 MB nutrient table is the cost.
const dataset = loadDataset();

describe('loadDataset (real vendored zip)', () => {
  it('loads all 7,793 SR Legacy foods', () => {
    expect(dataset.foods).toHaveLength(7793);
  });

  it('joins identity: description, NDB number, category name', () => {
    const biscuits = dataset.foods.find((f) => f.fdcId === 167512);
    expect(biscuits?.description).toBe(
      'Pillsbury Golden Layer Buttermilk Biscuits, Artificial Flavor, refrigerated dough',
    );
    expect(biscuits?.ndbNumber).toBe('18634');
    expect(biscuits?.category).toBe('Baked Products');
  });

  it('joins nutrient rows with names and units', () => {
    const biscuits = dataset.foods.find((f) => f.fdcId === 167512);
    const protein = biscuits?.nutrients.find((n) => n.nutrientId === 1003);
    expect(protein?.amount).toBe(5.88);
    expect(protein?.name).toBe('Protein');
    expect(protein?.unit).toBe('G');
  });

  it('joins portions with resolved measure-unit names', () => {
    const biscuits = dataset.foods.find((f) => f.fdcId === 167512);
    expect(biscuits?.portions).toEqual([
      {
        id: 81549,
        amount: 1,
        unitName: 'undetermined',
        portionDescription: '',
        modifier: 'serving',
        gramWeight: 34,
      },
    ]);
  });

  it('joins calorie and protein conversion factors where present', () => {
    const withCalorieFactor = dataset.foods.filter((f) => f.calorieConversionFactor !== null);
    expect(withCalorieFactor.length).toBeGreaterThan(4000);
    const biscuits = dataset.foods.find((f) => f.fdcId === 167512);
    expect(biscuits?.proteinConversionFactor).toBe(6.25);
  });
});
