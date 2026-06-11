import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The invariant suite parses the full 36 MB food_nutrient.csv.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
