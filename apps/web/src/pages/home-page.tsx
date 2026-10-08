import { ArrowRight, BookOpen, Code2, Layers3, ShieldCheck, Zap } from "lucide-react";
import { type PropsWithChildren } from "react";
import { AppLink, Reveal, SectionHeading } from "../components/site-ui.js";
import { HeroBackground } from "../components/hero-background.js";
function Magnetic({ children }: PropsWithChildren): React.JSX.Element {
  return <span className="magnetic">{children}</span>;
}

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
          <div className="eyebrow">
            <span className="live-dot" />
            Open-source motion registry · built for React
          </div>
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
            A curated system of production-ready animated components. Install the source, tune every
            detail, and ship interactions that feel unmistakably yours.
          </p>
          <div className="hero-signals" aria-label="Framebits highlights">
            <span>TypeScript native</span>
            <span>Accessible motion</span>
            <span>Zero runtime lock-in</span>
          </div>
          <div className="hero-actions">
            <Magnetic>
              <AppLink href="/components" className="button button-primary">
                Explore components <ArrowRight size={18} />
              </AppLink>
            </Magnetic>
            <AppLink href="/docs" className="button button-secondary">
              Get started <BookOpen size={18} />
            </AppLink>
          </div>
        </div>
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
            title="Beautiful motion. Serious engineering."
            description="The expressive layer stays flexible while the delivery layer remains deterministic, auditable, and yours."
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

export function HomePage(): React.JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className="home-main">
      <Hero />
      <section className="section home-destinations">
        <div className="shell">
          <div className="section-topline">
            <SectionHeading
              kicker="Make something move"
              title="Your next step starts here."
              description="Find an interaction you love, then bring it into your project."
            />
          </div>
          <div className="destination-grid">
            <AppLink href="/components" className="destination-card">
              <span className="destination-icon">
                <Layers3 size={24} />
              </span>
              <span className="destination-kicker">The collection</span>
              <h3>Explore components</h3>
              <p>
                Browse previews, filter by category, and open a component to try it and inspect its
                source.
              </p>
              <span className="text-link">
                Open the collection <ArrowRight size={18} />
              </span>
            </AppLink>
            <AppLink href="/docs" className="destination-card">
              <span className="destination-icon">
                <BookOpen size={24} />
              </span>
              <span className="destination-kicker">The guide</span>
              <h3>Start building</h3>
              <p>
                Set up the CLI, add your first component, and learn how to make the source your own.
              </p>
              <span className="text-link">
                Read the setup guide <ArrowRight size={18} />
              </span>
            </AppLink>
          </div>
        </div>
      </section>
      <ValueSection />
    </main>
  );
}
