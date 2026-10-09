import type { RegistryItem, RegistryIndexItem } from "@framebits/shared";
import { ArrowLeft, Check, Code2, Copy, Play, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatCategory } from "../lib/catalog.js";
import type { RegistryClient } from "../lib/registry.js";
import type { IndexState } from "../lib/page-state.js";
import { LiveDemo } from "../lib/live-demos.js";
import { MAX_RENDER_CHARS, truncateForDisplay } from "../lib/code-view.js";
import { AppLink, CopyCommandButton, ErrorPanel, PreviewStaticArt } from "../components/site-ui.js";
import { ComponentSidebar } from "../components/component-sidebar.js";
type ItemState =
  | { status: "loading" }
  | { status: "ready"; item: RegistryItem }
  | { status: "error"; message: string };

function DetailPreview({ item }: { item: RegistryIndexItem }): React.JSX.Element {
  const fallback = <PreviewStaticArt item={item} />;
  if (item.type !== "component") return fallback;
  return <LiveDemo slug={item.slug} fallback={fallback} />;
}

export function DetailPage({
  slug,
  client,
  indexState,
  retryIndex,
}: {
  slug: string;
  client: RegistryClient;
  indexState: IndexState;
  retryIndex: () => void;
}): React.JSX.Element {
  const [state, setState] = useState<ItemState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<"preview" | "code">("preview");
  const viewTabs = useRef<Array<HTMLButtonElement | null>>([]);
  const workspaceId = useId();
  const fileTabs = useRef<Array<HTMLButtonElement | null>>([]);
  const filePanelId = useId();
  const indexItem =
    indexState.status === "ready"
      ? indexState.index.items.find((candidate) => candidate.slug === slug)
      : undefined;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void client.loadItem(slug, controller.signal).then(
      (item) => {
        setState({ status: "ready", item });
        setSelectedPath(item.files[0]?.path ?? "");
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown registry error",
        });
      },
    );
    return () => {
      controller.abort();
    };
  }, [client, reloadKey, slug]);

  const selectedFile =
    state.status === "ready"
      ? (state.item.files.find((file) => file.path === selectedPath) ?? state.item.files[0])
      : undefined;
  const display = selectedFile === undefined ? undefined : truncateForDisplay(selectedFile.content);

  const selectFile = (index: number): void => {
    if (state.status !== "ready") return;
    const next = state.item.files[index];
    if (next === undefined) return;
    setSelectedPath(next.path);
    fileTabs.current[index]?.focus();
  };

  const stepFile = (direction: 1 | -1): void => {
    if (state.status !== "ready" || selectedFile === undefined) return;
    const current = state.item.files.findIndex((file) => file.path === selectedFile.path);
    selectFile((current + direction + state.item.files.length) % state.item.files.length);
  };

  const selectView = (index: number): void => {
    setView(index === 0 ? "preview" : "code");
    viewTabs.current[index]?.focus();
  };

  return (
    <main id="main-content" tabIndex={-1} className="page detail-page">
      <div className="shell component-browser-layout">
        <ComponentSidebar state={indexState} activeSlug={slug} retry={retryIndex} />
        <div className="component-browser-content">
          <AppLink href="/components" className="back-link">
            <ArrowLeft size={17} /> Back to components
          </AppLink>
          {state.status === "loading" ? <DetailSkeleton /> : null}
          {state.status === "error" ? (
            <ErrorPanel
              message={state.message}
              retry={() => {
                setReloadKey((value) => value + 1);
              }}
            />
          ) : null}
          {state.status === "ready" ? (
            <>
              <section className="detail-heading">
                <div className="detail-copy">
                  <div className="detail-kicker">
                    <span>
                      {indexItem === undefined
                        ? state.item.type
                        : formatCategory(indexItem.category)}
                    </span>
                    <i />
                    <span>v{state.item.version}</span>
                  </div>
                  <h1>{state.item.title}</h1>
                  <p>{indexItem?.description ?? "Validated source from the Framebits registry."}</p>
                </div>
                <CopyCommandButton command={`npx @framebits/cli add ${slug}`} />
              </section>

              <section
                className="component-workspace"
                aria-label={`${state.item.title} playground`}
              >
                <div className="workspace-toolbar">
                  <div
                    className="workspace-view-tabs"
                    role="tablist"
                    aria-label="Component view"
                    onKeyDown={(event) => {
                      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      const index =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 1
                            : view === "preview"
                              ? 1
                              : 0;
                      selectView(index);
                    }}
                  >
                    {(["preview", "code"] as const).map((value, index) => (
                      <button
                        key={value}
                        ref={(element) => {
                          viewTabs.current[index] = element;
                        }}
                        type="button"
                        role="tab"
                        id={`${workspaceId}-${value}-tab`}
                        aria-controls={`${workspaceId}-${value}`}
                        aria-selected={view === value}
                        tabIndex={view === value ? 0 : -1}
                        onClick={() => {
                          setView(value);
                        }}
                      >
                        {value === "preview" ? (
                          <Play size={16} aria-hidden="true" />
                        ) : (
                          <Code2 size={16} aria-hidden="true" />
                        )}
                        {value === "preview" ? "Preview" : "Code"}
                      </button>
                    ))}
                  </div>
                  {selectedFile === undefined ||
                  display === undefined ? null : display.truncated ? (
                    <span className="copy-code-disabled" title="File too large to preview fully">
                      Source too large — use the CLI
                    </span>
                  ) : (
                    <CopyCodeButton content={selectedFile.content} />
                  )}
                </div>
                <div
                  className="component-preview"
                  id={`${workspaceId}-preview`}
                  role="tabpanel"
                  aria-labelledby={`${workspaceId}-preview-tab`}
                  tabIndex={0}
                  hidden={view !== "preview"}
                >
                  {view === "preview" ? (
                    indexItem === undefined ? (
                      <p className="preview-pending" role="status">
                        {indexState.status === "loading"
                          ? "Loading preview…"
                          : "Open Code to inspect this component's source."}
                      </p>
                    ) : (
                      <DetailPreview item={indexItem} />
                    )
                  ) : null}
                </div>
                <div
                  className="workspace-source"
                  id={`${workspaceId}-code`}
                  role="tabpanel"
                  aria-labelledby={`${workspaceId}-code-tab`}
                  hidden={view !== "code"}
                >
                  {view === "code" ? (
                    <div className="code-panel">
                      <div
                        className="code-tabs"
                        role="tablist"
                        aria-label="Component files"
                        onKeyDown={(event) => {
                          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
                            return;
                          event.preventDefault();
                          if (event.key === "ArrowRight") stepFile(1);
                          else if (event.key === "ArrowLeft") stepFile(-1);
                          else selectFile(event.key === "Home" ? 0 : state.item.files.length - 1);
                        }}
                      >
                        {state.item.files.map((file, index) => (
                          <button
                            ref={(element) => {
                              fileTabs.current[index] = element;
                            }}
                            id={`${filePanelId}-tab-${String(index)}`}
                            type="button"
                            role="tab"
                            aria-controls={filePanelId}
                            aria-selected={selectedFile?.path === file.path}
                            tabIndex={selectedFile?.path === file.path ? 0 : -1}
                            className={selectedFile?.path === file.path ? "is-active" : ""}
                            onClick={() => {
                              setSelectedPath(file.path);
                            }}
                            key={file.path}
                          >
                            {selectedFile?.path === file.path ? (
                              <span className="code-tab-underline" aria-hidden="true" />
                            ) : null}
                            {file.path.split("/").at(-1)}
                          </button>
                        ))}
                      </div>
                      <pre
                        id={filePanelId}
                        role="tabpanel"
                        key={selectedFile?.path ?? "empty"}
                        tabIndex={0}
                        aria-labelledby={`${filePanelId}-tab-${String(state.item.files.findIndex((file) => file.path === selectedFile?.path))}`}
                      >
                        <code>{display?.text ?? ""}</code>
                      </pre>
                      {selectedFile !== undefined && display?.truncated === true ? (
                        <p className="truncated-notice" role="note">
                          This file ({display.totalChars} characters) is too large to preview fully
                          — showing the first {MAX_RENDER_CHARS}. Install it with{" "}
                          <code>npx @framebits/cli add {slug}</code> to inspect the complete source
                          locally.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="detail-layout detail-metadata" aria-label="Component information">
                <aside className="detail-sidebar">
                  <div className="info-card">
                    <h2>Registry details</h2>
                    <dl>
                      <div>
                        <dt>Version</dt>
                        <dd>{state.item.version}</dd>
                      </div>
                      <div>
                        <dt>Type</dt>
                        <dd>{state.item.type}</dd>
                      </div>
                      {indexItem === undefined ? null : (
                        <>
                          <div>
                            <dt>Difficulty</dt>
                            <dd>{indexItem.difficulty}</dd>
                          </div>
                          <div>
                            <dt>Performance</dt>
                            <dd>{indexItem.performance}</dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>Files</dt>
                        <dd>{state.item.files.length}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="info-card">
                    <h2>Dependencies</h2>
                    {Object.keys(state.item.dependencies).length === 0 &&
                    state.item.registryDependencies.length === 0 ? (
                      <p className="muted-copy">No external dependencies.</p>
                    ) : (
                      <ul className="dependency-list">
                        {Object.entries(state.item.dependencies).map(([name, version]) => (
                          <li key={name}>
                            <span>{name}</span>
                            <code>{version}</code>
                          </li>
                        ))}
                        {state.item.registryDependencies.map((name) => (
                          <li key={name}>
                            <span>{name}</span>
                            <code>registry</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="integrity-note">
                    <ShieldCheck size={18} />
                    <span>Hash verified by the CLI before files are written.</span>
                  </div>
                </aside>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function CopyCodeButton({ content }: { content: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      className={`copy-code${copied ? " is-copied" : ""}`}
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
    >
      <span className="copy-icon" aria-hidden="true">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </span>
      {copied ? "Copied" : "Copy source"}
    </button>
  );
}

function DetailSkeleton(): React.JSX.Element {
  return (
    <div className="detail-skeleton" aria-label="Loading component source">
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-line medium" />
      <div className="skeleton skeleton-code" />
    </div>
  );
}
