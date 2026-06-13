# Adding a locale

A locale in pantry is **a BCP-47 row plus data files — never a code change to
prose.** The prompt, schema, validator, and emitter all derive from the locale
table, and every localized string lives in a reviewable data file (no foreign
strings hardcoded in scripts). This guide walks the full path for a new target,
e.g. `ko-KR`. Each step names the invariant test that gates it, so you know
when a step is actually done.

> Read [DESIGN.md](../DESIGN.md) first — identity, the leaf/view law, the
> errand model, and the localization decisions are settled there.

## 1. Add the locale row

Add one entry to `LOCALES` in `scripts/translate/locales.ts`:

```ts
{
  tag: 'ko-KR',                 // BCP-47: a language AND a market
  language: 'Korean',
  market: 'South Korea',
  nameHints: '…translation guidance appended to the name instruction…',
  specialtyExamples: 'department-store food halls, import grocers, online',
  sections: KO_KR_SECTIONS,     // mirrors the vocabulary YAML slugs (step 2)
}
```

The `sections` array is the per-locale preferred errand vocabulary; it must
mirror the slugs in the vocabulary YAML exactly (the table is the prompt input,
the YAML is the review surface). There are **no localized strings in this
row** — `language`/`market`/`nameHints` are English prompt context.

## 2. Errand vocabulary — `l10n/vocabulary/ko-KR.yaml`

The store sections are **discovered from the data, not invented** (a closed
global enum forces wrong fits). Run the open-coding pass:

```
npx tsx scripts/translate/discover-errands.ts sample
npx tsx scripts/translate/discover-errands.ts submit --model claude-opus-4-8
npx tsx scripts/translate/discover-errands.ts collect --batch-id msgbatch_…
npx tsx scripts/translate/discover-errands.ts aggregate
```

Review the proposed clusters against real store signage, then write the frozen
YAML — `sections` (`slug`, signage `label`, discovery `merges`) plus the
three-value `stores` map:

```yaml
status: frozen
sections:
  - slug: meat
    label: 정육            # the sign a Korean supermarket actually hangs
    merges: [정육, 정육코너]
  # …
stores:
  primary: 마트
  specialty: 전문점
  online: 온라인
```

**Gate:** `tests/locales-vocab.test.ts` — the row's `sections` must equal the
YAML slugs, and `stores` must label exactly `primary`/`specialty`/`online`.

## 3. Nutrient names — `l10n/nutrients/ko-KR.yaml`

The en-US nutrient names are generated from the USDA zip (FDA panel wording +
USDA names); every other locale supplies its own. Key by the **stable USDA
nutrient id**, source each name from the market's national food-composition
standard, and anchor provenance with the INFOODS tagname:

```yaml
status: sourced
nutrients:
  - id: 1003
    name: 단백질
    tagname: PROCNT
    basis: 식품성분표 (RDA Korea) '단백질'
  # … all 149 ids …
```

**Gate:** `tests/nutrient-labels.test.ts` — a nutrient table is either empty
(`status: pending`, ships no names yet) or covers **exactly** the dataset's 149
nutrient ids. A gap or a stale id fails the build. Enumerate the target ids
with `buildNutrientDictionary` (`src/generator/nutrient-dictionary.ts`).

## 4. Generate the food baseline

Names, aliases, errands, and notes for all 7,793 foods run through the
Message Batches API. Partition by model tier first, then submit:

```
npx tsx scripts/translate/router.ts --write        # opus-set / cheap-set
npx tsx scripts/translate/batch-claude.ts submit --input out/cheap-set.json --model claude-haiku-4-5
npx tsx scripts/translate/batch-claude.ts submit --input out/opus-set.json  --model claude-opus-4-8 --chunk 1 --of 3
npx tsx scripts/translate/batch-claude.ts collect --batch-id msgbatch_…
npx tsx scripts/translate/baseline.ts import out/<results>.jsonl   # JSONL wire → per-food YAML
```

JSONL is the wire format only; the stored baseline is one YAML file per food
under `l10n/baseline/<slug>.yaml`. Re-queue failed rows with `submit --retry`.

> Paid batches at scale require the maintainer's explicit go (house rule).

## 5. Review

- `npx tsx scripts/translate/strays.ts` — surfaces off-vocabulary section coins
  to correct or adopt.
- `npx tsx scripts/translate/transliteration.ts` — flags literal-transliteration
  aliases for a human scan (a noisy sort, not a classifier).
- `l10n/ground-truth/ko-KR.yaml` — **human-written**, durable across every
  regeneration, wins over any machine output. An agent fixing machine output
  edits the baseline directly instead (same provenance class).

## 6. Emit

```
npm run build            # generates sr/ cores from the zip
npm run build:packages   # streams each locale tarball, labels.js baked in
```

The locale package ships `labels.js` (`{ sections, stores, nutrients }`) and
the `sr/<slug>{,.full}` views composing the core leaves by reference. Run
`npm test` — the sync and tripwire tests above guard the new locale.
