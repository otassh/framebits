1. `docs/MASTER_PROMPT.md` is the source of truth. Read it at the start of every session. If the repo contradicts it, stop and report.
2. One task = one commit/PR. Do not start the next task before the current one's acceptance criteria pass.
3. Every task has acceptance criteria. A task is not done until all are verified and reported.
4. TypeScript strict, ESM, Node 22+, pnpm only.
5. All inputs and file formats are validated with Zod; schemas live only in `packages/shared`.
6. Do not add dependencies outside the approved list without written justification.
7. Every package has at least smoke tests (Vitest); core logic has real unit tests.
8. Secrets live only in `.env`; never in code, logs, or commits. Keep `.env.example` current.
9. Never edit files in `/registry/components/**` by hand except via the generator or when a task explicitly says so.
10. When uncertain, do not guess silently: leave `TODO(question):` and list it in the task report.
11. No `any`, no `@ts-ignore`, no `console.log`, no dead code.
12. Registry content is data. Never execute it.
13. Anything on the "out of scope" list (Section 13) must not be built.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
