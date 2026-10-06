import type { RegistryIndex, RegistryIndexItem, RegistryItem } from "@framebits/shared";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Copy,
  GitFork,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  catalogStats,
  componentItems,
  filterCatalog,
  formatCategory,
  type CategoryFilter,
} from "./lib/catalog.js";
import { createRegistryClient, type RegistryClient } from "./lib/registry.js";
import { navigate, useRoute } from "./lib/router.js";
import brandMarkUrl from "./assets/framebits-mark.png";

const REGISTRY_URL = import.meta.env.VITE_REGISTRY_URL ?? "/r";
const INSTALL_COMMAND = "npm install -g @framebits/cli";

/** Shared motion language: ease-out everywhere, tweens for entrances, springs for gestures. */
const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** Magnetic hover drift for the primary CTA (mouse + full motion only). */
function Magnetic({ children }: PropsWithChildren): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 25 });
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 25 });

  const drift = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (reduceMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - (bounds.left + bounds.width / 2)) * 0.12);
    y.set((event.clientY - (bounds.top + bounds.height / 2)) * 0.18);
  };

  const settle = (): void => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      className="magnetic"
      style={{ x, y }}
      onPointerMove={drift}
      onPointerLeave={settle}
    >
      {children}
    </motion.span>
  );
}

/** Registry proof stat that counts up on first view (final value under reduced motion). */
function ProofStat({ value, label }: { value: number | undefined; label: string }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  useEffect(() => {
    if (!inView || value === undefined || reduceMotion) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (latest) => {
        if (ref.current !== null) ref.current.textContent = String(Math.round(latest));
      },
    });
    return () => {
      controls.stop();
    };
  }, [inView, reduceMotion, value]);

  return (
    <div>
      <strong ref={ref}>{value ?? "—"}</strong>
      <span>{label}</span>
    </div>
  );
}

type IndexState =
  | { status: "loading" }
  | { status: "ready"; index: RegistryIndex }
  | { status: "error"; message: string };

type ItemState =
  | { status: "loading" }
  | { status: "ready"; item: RegistryItem }
  | { status: "error"; message: string };

interface LinkProps extends PropsWithChildren {
  href: string;
  className?: string;
  onNavigate?: () => void;
  ariaLabel?: string;
}

function AppLink({
  href,
  className,
  children,
  onNavigate,
  ariaLabel,
}: LinkProps): React.JSX.Element {
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(href);
    onNavigate?.();
  };

  return (
    <a href={href} className={className} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </a>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  return (
    <AppLink
      href="/"
      className="brand"
      ariaLabel="Framebits home"
      {...(onNavigate === undefined ? {} : { onNavigate })}
    >
      <span className="brand-mark" aria-hidden="true">
        <img src={brandMarkUrl} alt="" width={29} height={29} decoding="async" />
      </span>
      <span className="brand-word">
        Frame<span>bits</span>
      </span>
    </AppLink>
  );
}

function Header(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const close = (): void => {
    setOpen(false);
  };

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (reduceMotion || open) {
      setHidden(false);
      return;
    }
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous + 2 && latest > 160) setHidden(true);
    else if (previous - latest > 2) setHidden(false);
  });

  return (
    <motion.header
      className="site-header"
      animate={hidden ? "hidden" : "visible"}
      variants={{ visible: { y: 0 }, hidden: { y: "-100%" } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="shell header-inner">
        <Brand onNavigate={close} />
        <nav className={`main-nav ${open ? "is-open" : ""}`} aria-label="Main navigation">
          <AppLink href="/components" onNavigate={close}>
            Components
          </AppLink>
          <a href="https://github.com/otassh/framebits" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <CopyCommandButton command="npx @framebits/cli init" compact />
        </nav>
        <button
          className="menu-button"
          type="button"
          onClick={() => {
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </motion.header>
  );
}

interface CopyCommandButtonProps {
  command: string;
  compact?: boolean;
  label?: string;
}

function CopyCommandButton({
  command,
  compact = false,
  label,
}: CopyCommandButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command);
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
      className={
        compact
          ? `copy-command copy-command-compact${copied ? " is-copied" : ""}`
          : `copy-command${copied ? " is-copied" : ""}`
      }
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy command: ${command}`}
    >
      <Terminal size={compact ? 14 : 17} aria-hidden="true" />
      <code>{label ?? command}</code>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          className="copy-icon"
          key={copied ? "check" : "copy"}
          initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
          transition={{ duration: 0.18, ease: EASE }}
          aria-hidden="true"
        >
          {copied ? <Check size={compact ? 14 : 17} /> : <Copy size={compact ? 14 : 17} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function AmbientField(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  return (
    <div className="ambient-field" aria-hidden="true">
      <motion.span
        className="ambient-orb ambient-orb-one"
        animate={reduceMotion ? false : { x: [0, 28, -8, 0], y: [0, -20, 12, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="ambient-orb ambient-orb-two"
        animate={reduceMotion ? false : { x: [0, -18, 16, 0], y: [0, 18, -14, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="ambient-grid" />
      <span className="ambient-beam" />
    </div>
  );
}

function ScrollProgress(): React.JSX.Element | null {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 170,
    damping: 28,
    mass: 0.2,
  });

  if (reduceMotion) return null;
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

interface HeroProps {
  state: IndexState;
}

function Hero({ state }: HeroProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const stats = state.status === "ready" ? catalogStats(state.index.items) : undefined;
  const stageRotateX = useSpring(useMotionValue(0), { stiffness: 180, damping: 24 });
  const stageRotateY = useSpring(useMotionValue(0), { stiffness: 180, damping: 24 });

  const moveStage = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (reduceMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    stageRotateX.set((0.5 - y) * 5);
    stageRotateY.set((x - 0.5) * 6);
    event.currentTarget.style.setProperty("--pointer-x", `${String(x * 100)}%`);
    event.currentTarget.style.setProperty("--pointer-y", `${String(y * 100)}%`);
  };

  const resetStage = (): void => {
    stageRotateX.set(0);
    stageRotateY.set(0);
  };

  return (
    <section className="hero">
      <AmbientField />
      <div className="shell hero-grid">
        <motion.div
          className="hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="eyebrow">
            <span className="live-dot" />
            Curated React motion, shipped as source
          </div>
          <h1 aria-label="Motion, without the mess.">
            <span className="hero-title-mask" aria-hidden="true">
              <motion.span
                className="hero-title-line"
                initial={reduceMotion ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.72, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
              >
                Motion,
              </motion.span>
            </span>
            <span className="hero-title-mask" aria-hidden="true">
              <motion.span
                className="hero-title-line hero-title-accent"
                initial={reduceMotion ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.72, delay: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              >
                without the mess.
              </motion.span>
            </span>
          </h1>
          <p className="hero-lede">
            Production-ready animated components you install, inspect, and own. No runtime lock-in.
            No mystery bundle. Just clean TypeScript in your codebase.
          </p>
          <div className="hero-actions">
            <Magnetic>
              <AppLink href="/components" className="button button-primary">
                Explore components <ArrowRight size={18} />
              </AppLink>
            </Magnetic>
            <CopyCommandButton command={INSTALL_COMMAND} label="Install the CLI" />
          </div>
          <div className="hero-proof" aria-label="Registry facts">
            <ProofStat value={stats?.components} label="published components" />
            <ProofStat value={stats?.categories} label="active categories" />
            <div>
              <strong>100%</strong>
              <span>source ownership</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="hero-stage"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.94, rotate: 1.5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            rotateX: stageRotateX,
            rotateY: stageRotateY,
            transformPerspective: 1000,
          }}
          onPointerMove={moveStage}
          onPointerLeave={resetStage}
        >
          <div className="stage-topbar">
            <span className="traffic-lights">
              <i />
              <i />
              <i />
            </span>
            <span>framebits / registry</span>
            <span className="stage-status">live</span>
          </div>
          <div className="stage-canvas">
            <div className="stage-glow" />
            <motion.div
              className="stage-card stage-card-back"
              animate={reduceMotion ? false : { y: [0, -7, 0], rotate: [-5, -3, -5] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <span>CSS-native</span>
              <strong>Shimmer</strong>
              <small>reduced-motion safe</small>
            </motion.div>
            <motion.div
              className="stage-card stage-card-front"
              animate={reduceMotion ? false : { y: [0, 9, 0], rotate: [4, 2, 4] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            >
              <span>motion/react</span>
              <strong className="aurora-word">Aurora</strong>
              <small>TypeScript + Tailwind</small>
            </motion.div>
            <div className="stage-command">
              <span>$</span> npx @framebits/cli add aurora-text
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function RegistryTicker({ state }: HeroProps): React.JSX.Element | null {
  const reduceMotion = useReducedMotion();
  if (state.status !== "ready" || state.index.items.length === 0) {
    const message =
      state.status === "loading"
        ? "Validating the live registry…"
        : state.status === "error"
          ? "Live registry connection paused"
          : "The live registry is ready for its first package";
    return (
      <aside className="registry-ticker registry-ticker-pending" aria-live="polite">
        <span>{message}</span>
      </aside>
    );
  }

  const registryItems = [...state.index.items, ...state.index.items];
  const renderItems = (copy: "primary" | "duplicate"): React.JSX.Element[] =>
    registryItems.map((item, index) => (
      <span className="ticker-item" key={`${copy}-${String(index)}-${item.slug}`}>
        <i aria-hidden="true" />
        <strong>{item.slug}</strong>
        <small>v{item.version}</small>
        <em>{item.type}</em>
      </span>
    ));

  return (
    <aside className="registry-ticker" aria-label="Live registry packages">
      <p className="sr-only">
        Live registry with {state.index.items.length} validated packages.
      </p>
      <div className={`ticker-track${reduceMotion ? " ticker-track-static" : ""}`} aria-hidden="true">
        <div className="ticker-set">{renderItems("primary")}</div>
        <div className="ticker-set">{renderItems("duplicate")}</div>
      </div>
    </aside>
  );
}

interface RevealProps extends PropsWithChildren {
  className?: string;
}

function Reveal({ children, className }: RevealProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <div className="section-heading">
      <span>{kicker}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function PreviewArtwork({ item }: { item: RegistryIndexItem }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  if (item.category === "text-animations") {
    return (
      <div className="preview-art preview-text" aria-hidden="true">
        <motion.span
          animate={reduceMotion ? false : { opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          Aurora
        </motion.span>
      </div>
    );
  }
  if (item.category === "buttons") {
    return (
      <div className="preview-art preview-button" aria-hidden="true">
        <motion.span
          whileHover={reduceMotion ? {} : { scale: 1.04 }}
          transition={{ type: "spring", stiffness: 340, damping: 24 }}
        >
          Hover the future <Sparkles size={15} />
        </motion.span>
      </div>
    );
  }
  return (
    <div className="preview-art preview-generic" aria-hidden="true">
      <motion.span
        animate={reduceMotion ? false : { rotate: [0, 120, 240, 360] }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function ComponentCard({
  item,
  index,
  immediate = false,
}: {
  item: RegistryIndexItem;
  index: number;
  /** Skip scroll-in gating so filter changes animate instantly. */
  immediate?: boolean;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();

  const glow = (event: ReactPointerEvent<HTMLElement>): void => {
    if (reduceMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--card-x",
      `${String(event.clientX - bounds.left)}px`,
    );
    event.currentTarget.style.setProperty(
      "--card-y",
      `${String(event.clientY - bounds.top)}px`,
    );
  };

  const entrance = immediate
    ? { animate: { opacity: 1, y: 0 } }
    : { whileInView: { opacity: 1, y: 0 } };

  return (
    <motion.article
      className="component-card"
      layout={immediate && !reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      {...entrance}
      whileHover={reduceMotion ? {} : { y: -6 }}
      whileTap={reduceMotion ? {} : { scale: 0.98 }}
      exit={reduceMotion ? {} : { opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.05, 0.2) }}
      onPointerMove={glow}
    >
      <AppLink href={`/components/${item.slug}`} className="card-link">
        <PreviewArtwork item={item} />
        <div className="card-body">
          <div className="card-meta">
            <span>{formatCategory(item.category)}</span>
            <span>v{item.version}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <div className="tag-row">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <span className="card-open">
            View source <ArrowRight size={16} />
          </span>
        </div>
      </AppLink>
    </motion.article>
  );
}

function LoadingCards(): React.JSX.Element {
  return (
    <div className="component-grid" aria-label="Loading components">
      {[0, 1].map((value) => (
        <div className="component-card skeleton-card" key={value}>
          <div className="skeleton skeleton-preview" />
          <div className="card-body">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line medium" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }): React.JSX.Element {
  return (
    <div className="state-panel error-panel" role="alert">
      <span className="state-icon">
        <Zap size={22} />
      </span>
      <div>
        <h3>Registry unavailable</h3>
        <p>{message}</p>
      </div>
      <button className="button button-secondary" type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

function HomeCatalog({
  state,
  retry,
}: {
  state: IndexState;
  retry: () => void;
}): React.JSX.Element {
  return (
    <section className="section catalog-preview-section">
      <div className="shell">
        <Reveal className="section-topline">
          <SectionHeading
            kicker="Live registry"
            title="Small collection. Sharp standards."
            description="Every item below comes from the same validated registry used by the CLI. Nothing here is staged or invented."
          />
          <AppLink href="/components" className="text-link">
            Browse all <ArrowRight size={17} />
          </AppLink>
        </Reveal>
        {state.status === "loading" ? <LoadingCards /> : null}
        {state.status === "error" ? <ErrorPanel message={state.message} retry={retry} /> : null}
        {state.status === "ready" ? (
          <div className="component-grid">
            {componentItems(state.index.items).map((item, index) => (
              <ComponentCard key={item.slug} item={item} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ValueSection(): React.JSX.Element {
  const values = [
    {
      icon: <Code2 size={21} />,
      title: "Own every line",
      text: "Components land in your project as readable TypeScript. Change the markup, timing, or tokens without waiting on a library release.",
    },
    {
      icon: <ShieldCheck size={21} />,
      title: "Validated by default",
      text: "Hashes, paths, imports, dependency allowlists, and registry contracts are checked before anything reaches your codebase.",
    },
    {
      icon: <Zap size={21} />,
      title: "Static and fast",
      text: "The CLI reads immutable static JSON. Component delivery stays available even when the API and database are offline.",
    },
  ];

  return (
    <section className="section value-section">
      <div className="shell">
        <Reveal>
          <SectionHeading
            kicker="Built for real projects"
            title="Animation should not own your architecture."
            description="Framebits is deliberately boring where it matters: deterministic files, explicit dependencies, and source you can audit."
          />
        </Reveal>
        <div className="value-grid">
          {values.map((value, index) => (
            <Reveal key={value.title} className="value-card">
              <span className="value-number">0{index + 1}</span>
              <span className="value-icon">{value.icon}</span>
              <h3>{value.title}</h3>
              <p>{value.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection({ state }: { state: IndexState }): React.JSX.Element {
  const aurora =
    state.status === "ready"
      ? state.index.items.find((item) => item.slug === "aurora-text")
      : undefined;
  const cn =
    state.status === "ready" ? state.index.items.find((item) => item.slug === "cn") : undefined;

  return (
    <section className="section workflow-section">
      <div className="shell workflow-grid">
        <Reveal className="workflow-copy">
          <SectionHeading
            kicker="Three deliberate steps"
            title="From registry to your codebase."
            description="No package runtime is left behind. The CLI resolves the dependency graph, verifies each hash, then writes only the files you selected."
          />
          <CopyCommandButton command="npx @framebits/cli add aurora-text" />
        </Reveal>
        <Reveal className="workflow-terminal">
          <div className="terminal-bar">
            <span>
              <i />
              <i />
              <i />
            </span>
            <small>framebits</small>
          </div>
          <div className="terminal-body">
            <p>
              <span>$</span> npx @framebits/cli add aurora-text
            </p>
            <p className="terminal-muted">Resolving registry dependencies…</p>
            {aurora === undefined || cn === undefined ? (
              <p className="terminal-muted">Reading the published registry…</p>
            ) : (
              <>
                <p>
                  <b>✓</b> Verified {aurora.slug}@{aurora.version}
                </p>
                <p>
                  <b>✓</b> Verified {cn.slug}@{cn.version}
                </p>
                <p>
                  <b>✓</b> Resolved {aurora.slug} + {cn.slug}
                </p>
                <p className="terminal-done">Registry items are ready to write.</p>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HomePage({ state, retry }: { state: IndexState; retry: () => void }): React.JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className="home-main">
      <Hero state={state} />
      <RegistryTicker state={state} />
      <HomeCatalog state={state} retry={retry} />
      <ValueSection />
      <WorkflowSection state={state} />
    </main>
  );
}

function CatalogPage({
  state,
  retry,
}: {
  state: IndexState;
  retry: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const reduceMotion = useReducedMotion();
  const deferredQuery = useDeferredValue(query);
  const items = state.status === "ready" ? componentItems(state.index.items) : [];
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))),
    [items],
  );
  const filtered =
    state.status === "ready"
      ? filterCatalog(state.index.items, { query: deferredQuery, category })
      : [];
  const options: CategoryFilter[] = ["all", ...categories];

  const stepCategory = (direction: 1 | -1): void => {
    const current = options.indexOf(category);
    const next = options[(current + direction + options.length) % options.length];
    if (next !== undefined) setCategory(next);
  };

  return (
    <main id="main-content" tabIndex={-1} className="page catalog-page">
      <div className="shell">
        <div className="page-heading">
          <div>
            <span className="eyebrow eyebrow-static">Component registry</span>
            <h1>Find your next interaction.</h1>
          </div>
          <p>
            Search the live registry by name, category, or capability. Every result is installable
            now.
          </p>
        </div>
        <div className="catalog-toolbar">
          <label className="search-field">
            <Search size={19} aria-hidden="true" />
            <span className="sr-only">Search components</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search components, tags, categories…"
            />
            <AnimatePresence initial={false}>
              {query !== "" ? (
                <motion.button
                  type="button"
                  key="clear"
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.75 }}
                  transition={{ duration: 0.15, ease: EASE }}
                  onClick={() => {
                    setQuery("");
                  }}
                  aria-label="Clear search"
                >
                  <X size={17} />
                </motion.button>
              ) : null}
            </AnimatePresence>
          </label>
          <div
            className="filter-row"
            role="group"
            aria-label="Filter by category"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") stepCategory(1);
              else if (event.key === "ArrowLeft") stepCategory(-1);
            }}
          >
            <button
              type="button"
              className={category === "all" ? "is-active" : ""}
              aria-pressed={category === "all"}
              onClick={() => {
                setCategory("all");
              }}
            >
              {category === "all" && !reduceMotion ? (
                <motion.span className="filter-pill" layoutId="filter-pill" aria-hidden="true" />
              ) : null}
              <span className="filter-label">
                All <span>{items.length}</span>
              </span>
            </button>
            {categories.map((value) => (
              <button
                type="button"
                className={category === value ? "is-active" : ""}
                aria-pressed={category === value}
                onClick={() => {
                  setCategory(value);
                }}
                key={value}
              >
                {category === value && !reduceMotion ? (
                  <motion.span className="filter-pill" layoutId="filter-pill" aria-hidden="true" />
                ) : null}
                <span className="filter-label">
                  {formatCategory(value)}
                  <span>{items.filter((item) => item.category === value).length}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {state.status === "loading" ? <LoadingCards /> : null}
        {state.status === "error" ? <ErrorPanel message={state.message} retry={retry} /> : null}
        {state.status === "ready" ? (
          <p className="result-count" role="status" aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={filtered.length}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? {} : { opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: EASE }}
              >
                {filtered.length} of {items.length}
              </motion.span>
            </AnimatePresence>
          </p>
        ) : null}
        {state.status === "ready" && filtered.length > 0 ? (
          <motion.div className="component-grid catalog-grid" layout={reduceMotion ? false : true}>
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((item, index) => (
                <ComponentCard key={item.slug} item={item} index={index} immediate />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : null}
        {state.status === "ready" && filtered.length === 0 ? (
          <motion.div
            className="state-panel empty-panel"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <span className="state-icon">
              <Search size={22} />
            </span>
            <div>
              <h3>No matching components</h3>
              <p>Try a broader query or select a different category.</p>
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Reset filters
            </button>
          </motion.div>
        ) : null}
      </div>
    </main>
  );
}

function DetailPage({
  slug,
  client,
  indexState,
}: {
  slug: string;
  client: RegistryClient;
  indexState: IndexState;
}): React.JSX.Element {
  const [state, setState] = useState<ItemState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reduceMotion = useReducedMotion();
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

  const stepFile = (direction: 1 | -1): void => {
    if (state.status !== "ready" || selectedFile === undefined) return;
    const current = state.item.files.findIndex((file) => file.path === selectedFile.path);
    const next = state.item.files[(current + direction + state.item.files.length) % state.item.files.length];
    if (next !== undefined) setSelectedPath(next.path);
  };

  return (
    <main id="main-content" tabIndex={-1} className="page detail-page">
      <div className="shell">
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
            <section className="detail-hero">
              <div className="detail-copy">
                <div className="detail-kicker">
                  <span>
                    {indexItem === undefined ? state.item.type : formatCategory(indexItem.category)}
                  </span>
                  <i />
                  <span>v{state.item.version}</span>
                </div>
                <h1>{state.item.title}</h1>
                <p>{indexItem?.description ?? "Validated source from the Framebits registry."}</p>
                <CopyCommandButton command={`npx @framebits/cli add ${slug}`} />
              </div>
              {indexItem === undefined ? null : <PreviewArtwork item={indexItem} />}
            </section>

            <section className="detail-layout">
              <div className="code-panel">
                <div
                  className="code-tabs"
                  role="tablist"
                  aria-label="Component files"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") stepFile(1);
                    else if (event.key === "ArrowLeft") stepFile(-1);
                  }}
                >
                  {state.item.files.map((file) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedFile?.path === file.path}
                      className={selectedFile?.path === file.path ? "is-active" : ""}
                      onClick={() => {
                        setSelectedPath(file.path);
                      }}
                      key={file.path}
                    >
                      {selectedFile?.path === file.path && !reduceMotion ? (
                        <motion.span
                          className="code-tab-underline"
                          layoutId="code-tab-underline"
                          aria-hidden="true"
                        />
                      ) : null}
                      {file.path.split("/").at(-1)}
                    </button>
                  ))}
                  {selectedFile === undefined ? null : (
                    <CopyCodeButton content={selectedFile.content} />
                  )}
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.pre
                    key={selectedFile?.path ?? "empty"}
                    tabIndex={0}
                    aria-label={selectedFile?.path ?? "Component source"}
                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? {} : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: EASE }}
                  >
                    <code>{selectedFile?.content ?? ""}</code>
                  </motion.pre>
                </AnimatePresence>
              </div>
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
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          className="copy-icon"
          key={copied ? "check" : "copy"}
          initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
          transition={{ duration: 0.18, ease: EASE }}
          aria-hidden="true"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </motion.span>
      </AnimatePresence>
      {copied ? "Copied" : "Copy"}
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

function NotFoundPage(): React.JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className="page not-found-page">
      <div className="shell not-found-inner">
        <span>404</span>
        <h1>This frame slipped away.</h1>
        <p>The page does not exist, but the registry is right where you left it.</p>
        <AppLink href="/components" className="button button-primary">
          Browse components <ArrowRight size={18} />
        </AppLink>
      </div>
    </main>
  );
}

function Footer(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  return (
    <motion.footer
      className="site-footer"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <div className="shell footer-grid">
        <div>
          <Brand />
          <p>Curated motion components. Your source, your system.</p>
        </div>
        <div className="footer-links">
          <AppLink href="/components">Components</AppLink>
          <a href="https://github.com/otassh/framebits" target="_blank" rel="noreferrer">
            <GitFork size={16} /> GitHub
          </a>
          <a href="https://www.npmjs.com/package/@framebits/cli" target="_blank" rel="noreferrer">
            <Package size={16} /> npm
          </a>
        </div>
        <p className="footer-meta">Built from the live Framebits registry.</p>
      </div>
    </motion.footer>
  );
}

export function App(): React.JSX.Element {
  const route = useRoute();
  const reduceMotion = useReducedMotion();
  const client = useMemo(() => createRegistryClient({ baseUrl: REGISTRY_URL }), []);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<IndexState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void client.loadIndex(controller.signal).then(
      (index) => {
        setState({ status: "ready", index });
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
  }, [client, reloadKey]);

  const routeKey = route.kind === "component" ? `${route.kind}:${route.slug}` : route.kind;

  useEffect(() => {
    const title =
      route.kind === "home"
        ? "Framebits — Motion, without the mess"
        : route.kind === "catalog"
          ? "Components — Framebits"
          : route.kind === "component"
            ? `${route.slug} — Framebits`
            : "Not found — Framebits";
    document.title = title;
  }, [route]);

  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [routeKey]);

  const retry = (): void => {
    setReloadKey((value) => value + 1);
  };

  return (
    <MotionConfig transition={{ ease: EASE, duration: 0.45 }} reducedMotion="user">
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="grain" aria-hidden="true" />
        <ScrollProgress />
        <Header />
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={routeKey}
            id="route-view"
            initial={reduceMotion ? false : { opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? {} : { opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            {route.kind === "home" ? <HomePage state={state} retry={retry} /> : null}
            {route.kind === "catalog" ? <CatalogPage state={state} retry={retry} /> : null}
            {route.kind === "component" ? (
              <DetailPage slug={route.slug} client={client} indexState={state} />
            ) : null}
            {route.kind === "not-found" ? <NotFoundPage /> : null}
          </motion.div>
        </AnimatePresence>
        <Footer />
      </div>
    </MotionConfig>
  );
}
