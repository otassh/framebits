import type { RegistryIndexItem } from "@framebits/shared";
import { Check, Copy, Menu, Terminal, X, Zap } from "lucide-react";
import { useInView, usePageInView, useReducedMotion } from "motion/react";
import { type MouseEvent, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { LiveDemo } from "../lib/live-demos.js";
import { navigate, type AppRoute } from "../lib/router.js";
import brandMarkUrl from "../assets/framebits-mark.png";
import { GitHubStars } from "./github-stars.js";
interface LinkProps extends PropsWithChildren {
  href: string;
  className?: string;
  onNavigate?: () => void;
  ariaLabel?: string;
  current?: boolean;
}

export function AppLink({
  href,
  className,
  children,
  onNavigate,
  ariaLabel,
  current = false,
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
    <a
      href={href}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </a>
  );
}

export function Brand({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
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
      <span className="brand-edition">motion registry</span>
    </AppLink>
  );
}

export function Header({ route }: { route: AppRoute }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    setOpen(false);
  };

  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    const onResize = (): void => {
      if (!mobile.matches) setOpen(false);
    };
    mobile.addEventListener("change", onResize);
    return () => {
      mobile.removeEventListener("change", onResize);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    headerRef.current?.querySelector<HTMLAnchorElement>(".main-nav a")?.focus();

    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuRef.current?.focus();
    };
    const onOutside = (event: Event): void => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setOpen(false);
        if (
          event.type === "pointerdown" &&
          headerRef.current?.querySelector(".main-nav")?.contains(document.activeElement)
        ) {
          menuRef.current?.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("keydown", onEscape);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  return (
    <header className="site-header" ref={headerRef}>
      <div className="shell header-inner">
        <Brand onNavigate={close} />
        <nav
          id="main-navigation"
          className={`main-nav ${open ? "is-open" : ""}`}
          aria-label="Main navigation"
        >
          <AppLink href="/" onNavigate={close} current={route.kind === "home"}>
            Home
          </AppLink>
          <AppLink
            href="/components"
            onNavigate={close}
            current={route.kind === "catalog" || route.kind === "component"}
          >
            Components
          </AppLink>
          <AppLink href="/docs" onNavigate={close} current={route.kind === "docs"}>
            Docs
          </AppLink>
        </nav>
        <div className="header-actions">
          <GitHubStars />
          <button
            ref={menuRef}
            className="menu-button"
            type="button"
            onClick={() => {
              setOpen((value) => !value);
            }}
            aria-expanded={open}
            aria-controls="main-navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

interface CopyCommandButtonProps {
  command: string;
  compact?: boolean;
  label?: string;
}

export function CopyCommandButton({
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
      <span className="copy-icon" aria-hidden="true">
        {copied ? <Check size={compact ? 14 : 17} /> : <Copy size={compact ? 14 : 17} />}
      </span>
    </button>
  );
}

interface RevealProps extends PropsWithChildren {
  className?: string;
}

export function Reveal({ children, className }: RevealProps): React.JSX.Element {
  return (
    <div className={className === undefined ? "reveal" : `reveal ${className}`}>{children}</div>
  );
}

export function SectionHeading({
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

export function PreviewStaticArt({ item }: { item: RegistryIndexItem }): React.JSX.Element {
  const [previewFailed, setPreviewFailed] = useState(false);
  if (item.previews !== undefined && !previewFailed) {
    return (
      <div className="preview-art preview-generated">
        <img
          src={item.previews.image}
          alt={`${item.title} component preview`}
          loading="lazy"
          decoding="async"
          onError={() => {
            setPreviewFailed(true);
          }}
        />
      </div>
    );
  }
  return <div className="preview-art preview-empty" aria-hidden="true" />;
}

export function ComponentCard({ item }: { item: RegistryIndexItem }): React.JSX.Element {
  const cardRef = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = useInView(cardRef, { amount: 0.1 });
  const pageVisible = usePageInView();
  const reducedMotion = useReducedMotion();
  const active = (hovered || focused) && visible && pageVisible && !reducedMotion;
  const still = <PreviewStaticArt item={item} />;

  return (
    <article
      ref={cardRef}
      className="component-card"
      data-preview-active={active}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onPointerCancel={() => {
        setHovered(false);
      }}
      onFocusCapture={(event) => {
        setFocused(event.target.matches(":focus-visible"));
      }}
      onBlurCapture={() => {
        setFocused(false);
      }}
    >
      <div className={`card-preview card-preview-${item.slug}`} inert aria-hidden="true">
        {active ? <LiveDemo slug={item.slug} fallback={still} /> : still}
      </div>
      <h3 className="card-title">
        <AppLink href={`/components/${item.slug}`} className="card-link">
          {item.title}
        </AppLink>
      </h3>
    </article>
  );
}

export function LoadingCards(): React.JSX.Element {
  return (
    <div className="component-grid" aria-label="Loading components">
      {[0, 1].map((value) => (
        <div className="component-card skeleton-card" key={value}>
          <div className="card-preview">
            <div className="skeleton skeleton-preview" />
          </div>
          <div className="card-title">
            <div className="skeleton skeleton-line title" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorPanel({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}): React.JSX.Element {
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
