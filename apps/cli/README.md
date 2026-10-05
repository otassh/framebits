# algorithco-ui

The Algorithco UI CLI. Adds curated animated React components to your project.

## Install

```sh
npx algorithco-ui init
npx algorithco-ui add aurora-text
```

Or install globally (`npm i -g algorithco-ui`) and run `algorithco-ui`.

Requires Node >= 20. The bundle is a single ESM file (`dist/cli.js`, ~1 MB, no runtime dependencies to install).

## Usage

```sh
algorithco-ui init [--yes] [--cwd <dir>] [--registry <url>]
algorithco-ui add <slug...> [--overwrite] [--dry-run] [--yes] [--cwd <dir>] [--registry <url>] [--debug]
algorithco-ui --version
algorithco-ui --help
```

`init` detects the project (package manager, framework, TypeScript, Tailwind,
import aliases) and writes `algorithco-ui.json`. It never modifies `tsconfig`
or any other project file.

`add` fetches items from the registry, verifies hashes, resolves
`registryDependencies` (e.g. `aurora-text` pulls in `cn`), rewrites import
aliases to yours, writes files atomically (with rollback), and updates
`installed` in the config.

After `add`, the CLI prints clearly labeled **Manual steps (automated in a
later release)**: the package-manager install command for missing npm deps,
and the Tailwind keyframes/animation/cssVars snippet to merge. Tailwind
merging and npm install are automated in Task 5b; in 5a they are printed, not
applied.

Flags:

- `--overwrite`: overwrite conflicting files (default: fail before any write,
  or prompt per file when interactive).
- `--dry-run`: print the plan and manual steps; write nothing (exit 0).
- `--yes`: non-interactive defaults (does NOT imply `--overwrite`).
- `--cwd <dir>`: run inside another app directory.
- `--registry <url>`: override the registry (flag > env
  `ALGORITHCO_UI_REGISTRY_URL` > config > default `https://algorithco.dev/r`).
- `--debug`: show stack traces (otherwise concise messages with `Hint:`).

Exit codes: `0` success, `1` failure/conflict, `2` usage/config/detection,
`3` network, `4` integrity/security (hash mismatch, disallowed dependency,
unsafe path, bad schema).

See `docs/CLI.md` for commands, target mapping, rewriting rules, and the
security model.
