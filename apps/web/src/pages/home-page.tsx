import { ArrowRight, Star } from "lucide-react";
import { AppLink } from "../components/site-ui.js";
import { HomeCollection } from "../components/home-collection.js";
import type { IndexState } from "../lib/page-state.js";
import { HeroBackground } from "../components/hero-background.js";
import { GITHUB_REPO_URL } from "../lib/github-stars.js";

function AmbientField(): React.JSX.Element {
  return (
    <div className="ambient-field" aria-hidden="true">
      <span className="ambient-orb ambient-orb-one" />
      <span className="ambient-orb ambient-orb-two" />
      <span className="ambient-beam" />
    </div>
  );
}

function Hero(): React.JSX.Element {
  return (
    <section className="hero">
      <AmbientField />
      <HeroBackground />
      <div className="shell hero-grid">
        <div className="hero-copy">
          <h1 aria-label="Motion that feels engineered.">
            <span className="hero-title-mask" aria-hidden="true">
              <span className="hero-title-line hero-title-line-first">Motion that feels</span>
            </span>
            <span className="hero-title-mask" aria-hidden="true">
              <span className="hero-title-line hero-title-line-second hero-title-accent">
                engineered.
              </span>
            </span>
          </h1>
          <p className="hero-lede">
            Animated React components. Explore the collection, copy the source, and make it yours.
          </p>
          <div className="hero-actions">
            <AppLink href="/components" className="button button-primary">
              Explore components <ArrowRight size={18} aria-hidden="true" />
            </AppLink>
            <a
              href={GITHUB_REPO_URL}
              className="button button-secondary"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Star Framebits on GitHub (opens in a new tab)"
            >
              Star on GitHub <Star size={18} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage({
  state,
  retry,
}: {
  state: IndexState;
  retry: () => void;
}): React.JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className="home-main">
      <Hero />
      <HomeCollection state={state} retry={retry} />
    </main>
  );
}
