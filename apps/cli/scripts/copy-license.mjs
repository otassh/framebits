#!/usr/bin/env node
/* global process */
/**
 * Stage the root MIT `LICENSE` into `apps/cli/LICENSE` before pack/publish.
 *
 * npm packs only files inside the package directory (plus the auto-included
 * `package.json`/`README`/`LICENSE` names), so the root `LICENSE` would NOT
 * ship. This script byte-copies it next to `package.json`, where npm
 * auto-includes it in the tarball regardless of the `files` whitelist.
 *
 * The copy is generated (gitignored), never committed, so it cannot drift
 * from the root file. Runs via the `prepack` script, which npm executes for
 * both `npm pack` and `npm publish`. Never invokes any publish command.
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const source = join(dir, "..", "..", "..", "LICENSE");
const target = join(dir, "..", "LICENSE");

if (!existsSync(source)) {
  throw new Error(`copy-license: root LICENSE not found at ${source}`);
}
copyFileSync(source, target);
process.stdout.write("copy-license: staged root LICENSE into apps/cli/LICENSE\n");
