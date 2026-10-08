import { ArrowRight, BookOpen, Check, Code2, Terminal } from "lucide-react";
import { AppLink, CopyCommandButton } from "../components/site-ui.js";

const steps = [
  {
    id: "initialize",
    title: "Initialize your project",
    description:
      "Run this in your React project. The CLI detects your framework, TypeScript, Tailwind, and import aliases, then creates framebits.json.",
    command: "npx @framebits/cli init",
    note: "Your existing tsconfig and project files stay as they are.",
  },
  {
    id: "add-component",
    title: "Add a component",
    description:
      "Choose a component from the collection and copy its install command. Start with Aurora Text for a small, expressive accent.",
    command: "npx @framebits/cli add aurora-text",
    note: "The CLI verifies the source, resolves registry dependencies, writes the files, and installs missing packages.",
  },
  {
    id: "make-it-yours",
    title: "Make it yours",
    description:
      "Import the component from the path printed by the CLI. The files belong to your project: adjust the styles, markup, and motion directly in the source.",
    command: "npx @framebits/cli add shimmer-button --dry-run",
    note: "Use --dry-run to see the files and dependencies a component needs before making changes.",
  },
];

export function DocsPage(): React.JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className="page docs-page">
      <div className="shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <AppLink href="/">Home</AppLink>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Docs</span>
        </nav>
        <div className="workspace-heading">
          <span className="eyebrow eyebrow-static">Documentation</span>
          <h1>From first install to your own.</h1>
          <p>Three steps to bring Framebits into your React project.</p>
        </div>
        <div className="docs-layout">
          <aside className="workspace-sidebar docs-sidebar">
            <span className="sidebar-label">
              <BookOpen size={15} /> Getting started
            </span>
            <nav aria-label="On this page">
              {steps.map((step, index) => (
                <a href={`#${step.id}`} key={step.id}>
                  <span>0{index + 1}</span>
                  {step.title}
                </a>
              ))}
              <a href="#cli-options">
                <Terminal size={15} /> CLI options
              </a>
            </nav>
            <AppLink href="/components" className="sidebar-guide">
              Explore the collection <ArrowRight size={16} />
            </AppLink>
          </aside>
          <div className="docs-content">
            <div className="docs-requirements">
              <Check size={18} />
              <p>
                Start with a React project and Node.js 20 or newer. Run the commands from your
                project directory.
              </p>
            </div>
            {steps.map((step, index) => (
              <section className="docs-step" id={step.id} key={step.id}>
                <span className="step-number">0{index + 1}</span>
                <div>
                  <h2>{step.title}</h2>
                  <p>{step.description}</p>
                  <CopyCommandButton command={step.command} />
                  <p className="docs-note">{step.note}</p>
                  {step.id === "add-component" ? (
                    <AppLink href="/components/aurora-text" className="text-link">
                      Preview Aurora Text <ArrowRight size={16} />
                    </AppLink>
                  ) : null}
                </div>
              </section>
            ))}
            <section className="docs-options" id="cli-options">
              <span className="eyebrow eyebrow-static">A little more control</span>
              <h2>Useful CLI options</h2>
              <div className="docs-table-wrap">
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
