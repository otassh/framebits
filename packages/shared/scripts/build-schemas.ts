/**
 * Writes one JSON Schema file per contract schema to `dist-schemas/`
 * (later published under `/schema/*.json` by the builder).
 *
 * Usage: `pnpm --filter @framebits/shared build:schemas`
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JSON_SCHEMA_SOURCES } from "../src/json-schemas.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist-schemas");

await mkdir(root, { recursive: true });

const names = Object.keys(JSON_SCHEMA_SOURCES).sort();
for (const name of names) {
  const source = JSON_SCHEMA_SOURCES[name] as z.ZodType;
  const schema = z.toJSONSchema(source, { unrepresentable: "throw" });
  await writeFile(join(root, `${name}.json`), `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}
