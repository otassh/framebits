# React Bits and Framebits installation

Research and consumer verification: 2026-10-31.

| Capability          | React Bits                                         | Framebits                                                          |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| Delivery            | Source files through the shadcn CLI or manual copy | Source files through `@framebits/cli` or manual copy               |
| Variants            | JavaScript/TypeScript and plain CSS/Tailwind       | TypeScript; Tailwind 3 and 4 integration                           |
| Installation        | `shadcn add @react-bits/<Component>-TS-TW`         | `framebits init`, then `framebits add <slug>`                      |
| Configuration       | shadcn registry configuration                      | `framebits.json`, detected project aliases and CSS entry           |
| Registry            | Installable component entries                      | Static JSON built from validated in-repo sources                   |
| Local customization | Installed source is editable                       | Installed source is editable; conflicts require explicit overwrite |

React Bits documents its variant names, source ownership, manual copy steps, and
CLI flow in its [installation guide](https://reactbits.dev/get-started/installation).
Framebits' narrower supported setup is intentional; JavaScript and standalone
CSS variants are not implemented.

## Framebits acceptance criteria

The [CLI guide](CLI.md#install-verification) describes the reproducible checks.
The package installed into each consumer is the packed tarball, invoked through
the package manager's installed bin, rather than a workspace source import.

- Initialize real projects, including JSONC references and inherited aliases.
- Install every currently published component and the required helper files.
- Install actual registry-declared dependencies using pnpm.
- Install and build each component independently in a fresh Vite consumer.
- Build Next.js App Router/Tailwind 4 and Vite/Tailwind 3 and 4 projects that
  import all components. Verify the emitted animation and utility CSS.
- Preserve the project during dry runs and file conflicts; re-add idempotently.
- Run the consumer matrix for every pull request on Linux and Windows.

Local verification on Windows with Node 24.13.0:

| Check                             | Result                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Repository lint and typecheck     | Passed                                                                                                            |
| Repository unit/integration tests | 1,187 passed, including 307 CLI tests                                                                             |
| Registry integrity                | Passed; all 4 published entries unchanged                                                                         |
| Packed CLI 0.1.1 smoke test       | Passed                                                                                                            |
| Fresh consumer production builds  | Passed: Next.js, Vite/Tailwind 3 and 4, plus each component independently                                         |
| Full repository production build  | Passed in an isolated source copy; the active checkout's registry directory was locked by its running Vite server |

## Production availability

The permanent domain is `framebits.trqsh.uz`; the default registry is
`https://framebits.trqsh.uz/r`. CLI 0.1.1 contains the new defaults and alias
fixes. The already-published 0.1.0 package is immutable and needs the registry
override until 0.1.1 is published through the owner release workflow.

At the time of verification, the production registry returned HTTP 404 with
"Tunnel offline" for both `/r/index.json` and `/r/aurora-text.json`. Local
consumer tests exercise a built registry and do not establish public hosting
availability. The owner must bring that service online and release 0.1.1 before
the default public install command can be accepted as working end to end.
