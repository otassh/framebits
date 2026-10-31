# framebits

The Framebits CLI. Adds curated animated React components to your project.

## Install

```sh
npx @framebits/cli init
npx @framebits/cli add framebits-logo-3d
```

Or install globally (`npm i -g @framebits/cli`) and run `framebits`.

Using the CLI requires Node >= 20. Developing this repo requires Node >= 22. The bundle is a single ESM file (`dist/cli.js`, ~1 MB); the package manager installs its `cross-spawn` runtime dependency.

Components require TypeScript, React, and a configured import alias. Tailwind 3
and 4 are supported. In Vite, configure the alias in both `tsconfig.app.json`
and `vite.config.ts`; TypeScript paths alone do not configure the bundler.
See [`docs/CLI.md`](../../docs/CLI.md#consumer-project-setup) for setup examples.

## Usage

```sh
framebits init [--yes] [--cwd <dir>] [--registry <url>]
framebits add <slug...> [--overwrite] [--dry-run] [--yes] [--no-install] [--no-styles] [--cwd <dir>] [--registry <url>] [--timeout <seconds>] [--debug]
framebits --version
framebits --help
```

`init` detects the project (package manager, framework, TypeScript, Tailwind,
import aliases) and writes `framebits.json`. It never modifies `tsconfig`
or any other project file.

`add` fetches items from the registry, verifies hashes, resolves
`registryDependencies`, rewrites import
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
  `FRAMEBITS_REGISTRY_URL` > config > default `https://framebits.trqsh.uz/r`).
- `--timeout <seconds>`: network timeout, integer 1–300 (flag > env
  `FRAMEBITS_TIMEOUT` in seconds > `timeoutSeconds` in `framebits.json`
  in seconds > default 10 s). Invalid values exit 2.
- `--debug`: show stack traces (otherwise concise messages with `Hint:`).

Exit codes: `0` success, `1` failure/conflict, `2` usage/config/detection,
`3` network, `4` integrity/security (hash mismatch, disallowed dependency,
unsafe path, bad schema).

See `docs/CLI.md` for commands, target mapping, rewriting rules, and the
security model.
