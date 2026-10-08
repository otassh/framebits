import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

/**
 * Live component previews.
 *
 * Detail pages render the real registry `demo.tsx` for each component, while
 * catalog cards stay lightweight with generated static previews. The demos
 * are bundled at site-build time from the reviewed in-repo `registry/` tree
 * that `pnpm build:registry` validates. No remote or user-supplied code is
 * loaded here: the module set is fixed by the static `import.meta.glob` below,
 * and each demo ships as its own lazily-loaded chunk.
 *
 * If a slug has no bundled demo, its chunk fails to load, or rendering
 * throws, the caller-provided fallback (generated WebP, then category art)
 * renders instead — a broken demo can never break the detail page.
 */

type DemoModule = { default: ComponentType };
type DemoLoader = () => Promise<DemoModule>;

/** All published component demos, bundled lazily. Keys are repo-relative paths. */
const demoModules = import.meta.glob<DemoModule>("../../../../registry/components/*/*/demo.tsx");

const KEBAB_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Extract the component slug from a globbed demo path, or undefined. */
export function demoSlugFromPath(path: string): string | undefined {
  const match = /registry\/components\/[^/]+\/([^/]+)\/demo\.tsx$/.exec(path);
  const slug = match?.[1];
  if (slug === undefined || !KEBAB_PATTERN.test(slug)) return undefined;
  return slug;
}

/** Find the lazy loader for a slug among globbed demo modules, if present. */
export function findDemoLoader(
  slug: string,
  modules: Record<string, DemoLoader> = demoModules,
): DemoLoader | undefined {
  for (const [path, loader] of Object.entries(modules)) {
    if (demoSlugFromPath(path) === slug) return loader;
  }
  return undefined;
}

const lazyCache = new Map<string, LazyExoticComponent<ComponentType>>();

function cachedLazyDemo(slug: string, loader: DemoLoader): LazyExoticComponent<ComponentType> {
  const cached = lazyCache.get(slug);
  if (cached !== undefined) return cached;
  const created = lazy(loader);
  lazyCache.set(slug, created);
  return created;
}

interface LiveDemoBoundaryProps {
  resetKey: string;
  fallback: ReactNode;
  children: ReactNode;
}

interface LiveDemoBoundaryState {
  failed: boolean;
  lastKey: string;
}

/** Error boundary: a throwing demo degrades to the static fallback. */
class LiveDemoBoundary extends Component<LiveDemoBoundaryProps, LiveDemoBoundaryState> {
  public override state: LiveDemoBoundaryState = {
    failed: false,
    lastKey: this.props.resetKey,
  };

  public static getDerivedStateFromError(): Partial<LiveDemoBoundaryState> {
    return { failed: true };
  }

  public static getDerivedStateFromProps(
    props: LiveDemoBoundaryProps,
    state: LiveDemoBoundaryState,
  ): Partial<LiveDemoBoundaryState> | null {
    if (props.resetKey !== state.lastKey) {
      return { failed: false, lastKey: props.resetKey };
    }
    return null;
  }

  public override componentDidCatch(): void {
    // Intentionally silent: the fallback UI is the report. No console output.
  }

  public override render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export interface LiveDemoProps {
  slug: string;
  /** Rendered while the demo chunk loads, when no demo exists, or on error. */
  fallback: ReactNode;
}

/** Render the real live demo for a component slug, with graceful fallback. */
export function LiveDemo({ slug, fallback }: LiveDemoProps): React.JSX.Element {
  const loader = findDemoLoader(slug);
  if (loader === undefined) {
    return <div className="preview-live-missing">{fallback}</div>;
  }
  const LazyDemo = cachedLazyDemo(slug, loader);
  return (
    <div className="preview-live">
      <LiveDemoBoundary resetKey={slug} fallback={fallback}>
        <Suspense fallback={fallback}>
          <LazyDemo />
        </Suspense>
      </LiveDemoBoundary>
    </div>
  );
}
