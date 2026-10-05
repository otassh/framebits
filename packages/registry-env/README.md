# @framebits/registry-env

Private type-check environment for registry sources. Dev dependencies only, EXACT
pinned versions (no ranges): react, react-dom, their @types, every package in
`ALLOWED_DEPENDENCIES`, and the type packages they need. The builder materializes
items into `.tmp/` here so module resolution finds these node_modules.

Rule: adding a name to `ALLOWED_DEPENDENCIES` without pinning it here fails CI
(see the allowlist test in `packages/builder`).
