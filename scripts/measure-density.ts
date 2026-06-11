import { assemble } from '../src/generator/assemble.js';
import { loadDataset } from '../src/generator/load.js';

const foods = assemble(loadDataset());
const withDensity = foods.filter((f) => f.core.density !== null);
const values = withDensity
  .map((f) => f.core.density?.density_g_per_ml ?? Number.NaN)
  .sort((a, b) => a - b);

const pct = (p: number): number => values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? Number.NaN;
console.log(`foods: ${foods.length}, with density: ${values.length}`);
console.log(
  `min ${values[0]}  p1 ${pct(0.01)}  p50 ${pct(0.5)}  p99 ${pct(0.99)}  max ${values[values.length - 1]}`,
);

// Who falls below the plausibility floor? Re-derive without the band by
// reading raw portions for foods that currently get null.
const VOLUME_ML: Record<string, number> = {
  ml: 1, milliliter: 1, liter: 1000, 'cubic centimeter': 1, 'cubic inch': 16.387064,
  tsp: 4.92892159375, teaspoon: 4.92892159375, tbsp: 14.78676478125,
  tablespoon: 14.78676478125, tablespoons: 14.78676478125, 'fl oz': 29.5735295625,
  cup: 236.5882365, pint: 473.176473, quart: 946.352946, gallon: 3785.411784,
};
const dataset = loadDataset();
for (const food of dataset.foods) {
  for (const p of food.portions) {
    const ml = VOLUME_ML[p.modifier.trim().toLowerCase()];
    if (ml === undefined || p.portionDescription !== '' || !(p.amount > 0) || !(p.gramWeight > 0)) continue;
    const density = p.gramWeight / (p.amount * ml);
    if (density < 0.05 || density > 3) {
      console.log(
        `${density.toFixed(4)} | ${food.description.slice(0, 70)} | ${p.amount} ${p.modifier} = ${p.gramWeight} g`,
      );
    }
  }
}
