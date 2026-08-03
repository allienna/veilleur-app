// Generates TypeScript types from the JSON Schema source of truth.
// Deterministic: no timestamps in output; prettier formatting is pinned via the
// json-schema-to-typescript version in package.json. Output is committed and
// verified by `pnpm --filter @veilleur/shared run check`.
import { compileFromFile } from "json-schema-to-typescript";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const schemaDir = join(root, "schema");
const outDir = join(root, "generated", "ts");
mkdirSync(outDir, { recursive: true });

const banner =
  "/* eslint-disable */\n" +
  "/**\n * AUTO-GENERATED from shared/schema — DO NOT EDIT BY HAND.\n" +
  " * Regenerate with: pnpm --filter @veilleur/shared run gen\n */";

const options = {
  bannerComment: banner,
  cwd: schemaDir,
  declareExternallyReferenced: true,
  additionalProperties: false,
  format: true,
  style: { singleQuote: false },
};

const targets = [
  ["run-status.json", "run-status.ts"],
  ["run.json", "run.ts"],
  ["article.json", "article.ts"],
  ["push-subscription.json", "push-subscription.ts"],
  ["fiche.json", "fiche.ts"],
];

for (const [schema, out] of targets) {
  const ts = await compileFromFile(join(schemaDir, schema), options);
  writeFileSync(join(outDir, out), ts);
  console.error(`gen:ts → generated/ts/${out}`);
}
