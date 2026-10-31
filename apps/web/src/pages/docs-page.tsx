import { ArrowRight, BookOpen, Check, Code2, ShieldCheck } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { AppLink, CopyCommandButton } from "../components/site-ui.js";
import { DOC_COMMANDS, DOC_NAV } from "../lib/docs.js";

const steps = [
  {
    id: "install",
    title: "Initialize your project",
    description:
      "Run this in your React project. The CLI detects your framework, TypeScript, Tailwind, and import aliases, then creates framebits.json.",
    command: DOC_COMMANDS.init,
    note: "Your existing tsconfig and project files stay as they are.",
  },
  {
    id: "add",
    title: "Add a component",
    description:
      "Start with FrameBits Logo 3D: preview the interactive emblem, inspect its source, and install it in your project.",
    command: DOC_COMMANDS.add,
    note: "The CLI verifies the source, resolves registry dependencies, writes the files, and installs missing packages.",
  },
  {
    id: "files",
    title: "What gets written",
    description:
      "Import the component from the path printed by the CLI. The files belong to your project: adjust the styles, markup, and motion directly in the source.",
    command: DOC_COMMANDS.dryRun,
    note: "Use --dry-run to see the files and dependencies a component needs before making changes.",
  },
];

export function DocsPage(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState(DOC_NAV[0]?.id ?? "install");

  useEffect(() => {
    const nodes = DOC_NAV.map((item) => document.getElementById(item.id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);
        const id = visible[0]?.target.id;
        if (id !== undefined) setActiveId(id);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.25, 0.6] },
    );
    for (const node of nodes) observer.observe(node);
    const id = window.location.hash.replace(/^#/, "");
    if (id !== "") document.getElementById(id)?.scrollIntoView({ block: "start" });
    return () => {
      observer.disconnect();
    };
  }, []);

  const jump = (id: string): void => {
    const node = document.getElementById(id);
    if (node === null) return;
    window.history.replaceState({}, "", `/docs#${id}`);
    node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <main id="main-content" tabIndex={-1} className="page docs-page">
      <div className="shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <AppLink href="/">Home</AppLink>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Docs</span>
        </nav>
        <div className="docs-layout">
          <aside className="workspace-sidebar docs-sidebar">
            <span className="sidebar-label">
              <BookOpen size={15} /> Getting started
            </span>
            <nav aria-label="On this page">
              {DOC_NAV.map((item, index) => (
                <a
                  href={`#${item.id}`}
                  key={item.id}
                  aria-current={activeId === item.id ? "location" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    jump(item.id);
                  }}
                >
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <AppLink href="/components" className="sidebar-guide">
              Explore the collection <ArrowRight size={16} />
            </AppLink>
          </aside>
          <div className="docs-content">
            <div className="workspace-heading">
              <span className="content-label">Documentation</span>
              <h1>Make it part of your project.</h1>
              <p>A practical guide to the source, dependencies, and CLI.</p>
            </div>
            <div className="docs-requirements">
              <Check size={18} />
              <p>
                Start with a React project. Open a component, select Code, then copy each file and
                check its dependencies. Include any CSS files or required keyframes.
              </p>
            </div>
            <p className="docs-release-note">
              The published CLI needs a registry compatibility update. Use the source workflow above
              for now; the commands below are the CLI reference.
            </p>
            <div className="docs-command-rail" aria-label="Quick commands">
              <CopyCommandButton command={DOC_COMMANDS.init} />
              <CopyCommandButton command={DOC_COMMANDS.add} />
              <CopyCommandButton command={DOC_COMMANDS.dryRun} label="add --dry-run" />
            </div>
            {steps.map((step, index) => (
              <section className="docs-step" id={step.id} key={step.id}>
                <span className="step-number">0{index + 1}</span>
                <div>
                  <h2>{step.title}</h2>
                  <p>{step.description}</p>
                  <CopyCommandButton command={step.command} />
                  <p className="docs-note">{step.note}</p>
                  {step.id === "add" ? (
                    <AppLink href="/components/framebits-logo-3d" className="text-link">
                      Preview FrameBits Logo 3D <ArrowRight size={16} />
                    </AppLink>
                  ) : null}
                  {step.id === "files" ? (
                    <dl className="docs-files">
                      <div>
                        <dt>Component files</dt>
                        <dd>Registry paths map to your component, library, and hook aliases.</dd>
                      </div>
                      <div>
                        <dt>Tailwind</dt>
                        <dd>
                          CSS marker blocks support v3 and v4 without editing Tailwind config.
                        </dd>
                      </div>
                      <div>
                        <dt>npm packages</dt>
                        <dd>Missing allowlisted packages install unless you use --no-install.</dd>
                      </div>
                      <div>
                        <dt>Config</dt>
                        <dd>Installed entries in framebits.json update after the files land.</dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
              </section>
            ))}
            <section className="docs-step" id="safety">
              <span className="step-number">04</span>
              <div>
                <h2>Safety</h2>
                <p>
                  The CLI treats downloaded registry content as data. It checks the schema, slug,
                  version, SHA-256 hashes, and dependency allowlist before writing files. A mismatch
                  fails closed.
                </p>
                <p className="docs-note">
                  <ShieldCheck size={16} aria-hidden="true" /> Conflicts fail before any write
                  unless you pass --overwrite or confirm each file. Use --dry-run to review the plan
                  first. Re-running init preserves existing installed entries.
                </p>
                <p className="docs-note">
                  The CLI requires Node 20 or newer; repo development requires Node 22 or newer.
                </p>
              </div>
            </section>
            <section className="docs-options" id="cli-options">
              <span className="eyebrow eyebrow-static">A little more control</span>
              <h2>Useful CLI options</h2>
              <div
                className="docs-table-wrap"
                role="region"
                aria-label="CLI options table"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Option</th>
                      <th scope="col">What it does</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <code>--dry-run</code>
                      </td>
                      <td>Show the install plan without writing files.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>--no-install</code>
                      </td>
                      <td>Print the package install command for you to run.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>--no-styles</code>
                      </td>
                      <td>Print the CSS snippet instead of patching styles.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>--yes</code>
                      </td>
                      <td>Use non-interactive defaults without enabling overwrite.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>--registry &lt;url&gt;</code>
                      </td>
                      <td>Override the registry with HTTPS or a localhost URL.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>--cwd &lt;dir&gt;</code>
                      </td>
                      <td>Run inside another project directory.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>--overwrite</code>
                      </td>
                      <td>Replace conflicting component files.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                For the full command reference, run <code>npx @framebits/cli --help</code>.
              </p>
              <p className="docs-note">
                Exit codes: 0 success, 1 failure or conflict, 2 usage, 3 network, 4 integrity.
              </p>
            </section>
            <div className="docs-next">
              <Code2 size={25} />
              <div>
                <h2>Find your first component.</h2>
                <p>Open a preview, inspect the source, and take it with you.</p>
              </div>
              <AppLink href="/components" className="button button-primary">
                Browse components <ArrowRight size={17} />
              </AppLink>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
