# framebits

The Framebits CLI. Adds curated animated React components to your project.

## Install

```sh
npx framebits init
npx framebits add aurora-text
```

Or install globally (`npm i -g framebits`) and run `framebits`.

Requires Node >= 20. The bundle is a single ESM file (`dist/cli.js`, ~1 MB, no runtime dependencies to install).

## Usage

```sh
framebits init [--yes] [--cwd <dir>] [--registry <url>]
framebits add <slug...> [--overwrite] [--dry-run] [--yes] [--no-install] [--no-styles] [--cwd <dir>] [--registry <url>] [--debug]
framebits --version
framebits --help
```

`init` detects the project (package manager, framework, TypeScript, Tailwind,
import aliases) and writes `framebits.json`. It never modifies `tsconfig`
or any other project file.

`add` fetches items from the registry, verifies hashes, resolves
`registryDependencies` (e.g. `aurora-text` pulls in `cn`), rewrites import
aliases to yours, writes files atomically (with rollback), patches Tailwind
styles into the CSS entry, installs missing npm dependencies, and updates
`installed` in the config.

After `add`, the CLI prints a short summary (files created/unchanged, CSS
blocks written, packages installed). Manual output appears only for skipped
or impossible steps (exact command or CSS snippet).

Flags:

- `--overwrite`: overwrite conflicting files (default: fail before any write,
  or prompt per file when interactive).
- `--dry-run`: print the plan and manual steps; write nothing (exit 0).
- `--yes`: non-interactive defaults (does NOT imply `--overwrite`).
- `--no-install`: print the exact install command instead of running it.
- `--no-styles`: skip Tailwind CSS patching (print the snippet instead).
- `--cwd <dir>`: run inside another app directory.
- `--registry <url>`: override the registry (flag > env
  `FRAMEBITS_REGISTRY_URL` > config > default `https://framebits.dev/r`).
- `--debug`: show stack traces (otherwise concise messages with `Hint:`).

Exit codes: `0` success, `1` failure/conflict, `2` usage/config/detection,
`3` network, `4` integrity/security (hash mismatch, disallowed dependency,
unsafe path, bad schema).

See `docs/CLI.md` for commands, target mapping, rewriting rules, and the
security model.
