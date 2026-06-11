# Vendored source artifact

`FoodData_Central_sr_legacy_food_csv_2018-04.zip` is the official USDA
FoodData Central distribution of the SR Legacy dataset (final release,
April 2018), redistributed unmodified. USDA download URLs have rotted
before; the source artifact should be hostage to nobody.

Verify: `sha256sum -c CHECKSUMS.sha256`

SR Legacy is a work of the United States Government (USDA Agricultural
Research Service) and is in the public domain. Everything this repo
generates derives from this zip and nothing else — generated output is
never committed; CI rebuilds it reproducibly from this artifact.
