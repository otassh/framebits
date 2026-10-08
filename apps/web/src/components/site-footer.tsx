import { ArrowRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { useInView, usePageInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { AppLink, CopyCommandButton } from "./site-ui.js";
import { GITHUB_REPO_URL } from "../lib/github-stars.js";
import brandMarkUrl from "../assets/framebits-mark.png";
import { FooterWordmark } from "./footer-wordmark.js";

export function Footer(): React.JSX.Element {
  const footerRef = useRef<HTMLElement>(null);
  const visible = useInView(footerRef);
  const pageVisible = usePageInView();
  const reducedMotion = useReducedMotion();

  const backToTop = (): void => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    document
      .querySelector<HTMLAnchorElement>(".site-header .brand")
      ?.focus({ preventScroll: true });
  };

  return (
    <footer
      ref={footerRef}
      className={`motion-footer${visible && pageVisible ? " is-active" : ""}`}
    >
      <div className="footer-motion-rail" aria-hidden="true">
        <span />
      </div>
      <div className="shell footer-content">
        <div className="footer-topline">
          <span className="footer-kicker">
            <span /> THE NEXT FRAME IS YOURS
          </span>
          <button type="button" className="footer-back-top" onClick={backToTop}>
            Back to top <ArrowUp size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="footer-main">
          <div className="footer-invitation">
            <h2>
              Make it <span>move.</span>
            </h2>
            <p>
              A little motion goes a long way.
              <br />
              Find your next interaction. Make it your own.
            </p>
            <AppLink href="/components" className="footer-explore">
              Explore components{" "}
              <span>
                <ArrowUpRight size={23} aria-hidden="true" />
              </span>
            </AppLink>
          </div>
          <nav className="footer-navigation" aria-label="Footer navigation">
            <div className="footer-link-group">
              <h3>Explore</h3>
              <AppLink href="/">
                Home <ArrowRight size={14} aria-hidden="true" />
              </AppLink>
              <AppLink href="/components">
                Components <ArrowRight size={14} aria-hidden="true" />
              </AppLink>
              <AppLink href="/docs">
                Documentation <ArrowRight size={14} aria-hidden="true" />
              </AppLink>
            </div>
            <div className="footer-link-group">
              <h3>Open source</h3>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                GitHub <ArrowUpRight size={14} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href="https://www.npmjs.com/package/@framebits/cli"
                target="_blank"
                rel="noopener noreferrer"
              >
                npm package <ArrowUpRight size={14} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
                Feedback <ArrowUpRight size={14} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </nav>
        </div>
        <div className="footer-install">
          <span>
            <img src={brandMarkUrl} width={24} height={24} alt="" /> Your source. Your system.
          </span>
          <CopyCommandButton command="npx @framebits/cli init" compact />
        </div>
        <FooterWordmark />
        <div className="footer-bottom">
          <AppLink href="/" ariaLabel="Framebits home">
            © {new Date().getFullYear()} Framebits
          </AppLink>
          <span>Built for React. Made for you.</span>
          <a
            href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT licensed <ArrowUpRight size={12} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
