// Generates Pydantic v2 models from the JSON Schema source of truth.
// Deterministic: --disable-timestamp strips the generator timestamp; the
// datamodel-code-generator version is pinned in the uvx invocation below.
// Output is committed and verified by `pnpm --filter @veilleur/shared run check`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const schemaDir = join(root, "schema");
const outDir = join(root, "generated", "veilleur_shared");
mkdirSync(outDir, { recursive: true });

const PINNED = "datamodel-code-generator==0.26.3";

const targets = [
  ["run-status.json", "run_status.py"],
  ["run.json", "run.py"],
];

for (const [schema, out] of targets) {
  execFileSync(
    "uvx",
    [
      "--from",
      PINNED,
      "datamodel-codegen",
      "--input",
      join(schemaDir, schema),
      "--input-file-type",
      "jsonschema",
      "--output",
      join(outDir, out),
      "--output-model-type",
      "pydantic_v2.BaseModel",
      "--target-python-version",
      "3.12",
      "--disable-timestamp",
      "--use-double-quotes",
      // Emit Annotated[str, StringConstraints(...)] instead of constr(...) so consumers'
      // strict type-checkers resolve constrained fields (e.g. Run.date) to `str`.
      "--use-annotated",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  console.error(`gen:py → generated/veilleur_shared/${out}`);
}

// Static package marker so the generated models are importable by the Minion.
writeFileSync(
  join(outDir, "__init__.py"),
  '"""AUTO-GENERATED package — DO NOT EDIT. Regenerate with: pnpm --filter @veilleur/shared run gen"""\n',
);
console.error("gen:py → generated/veilleur_shared/__init__.py");
