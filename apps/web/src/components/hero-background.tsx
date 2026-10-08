import { useEffect, useRef } from "react";

/** The supplied ballpit is loaded only while the homepage hero is visible. */
export function HeroBackground(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>(".hero");
    if (canvas === null || hero === undefined || hero === null) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stopped = false;
    let loading = false;
    let visible = false;
    let scene: { dispose: () => void } | undefined;

    const sync = (): void => {
      if (reducedMotion.matches) {
        scene?.dispose();
        scene = undefined;
        canvas.dataset.ready = "false";
        return;
      }
      if (!visible || scene !== undefined || loading) return;
      loading = true;
      void import("../lib/hero-ballpit.js")
        .then(({ createHeroBallpit }) => {
          if (stopped || reducedMotion.matches) return;
          try {
            scene = createHeroBallpit(canvas, hero);
            canvas.dataset.ready = "true";
          } catch {
            // The existing ambient gradients remain the fallback without WebGL.
            canvas.dataset.ready = "false";
          }
        })
        .catch(() => {
          canvas.dataset.ready = "false";
        })
        .finally(() => {
          loading = false;
        });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      sync();
    });
    observer.observe(hero);
    reducedMotion.addEventListener("change", sync);
    return () => {
      stopped = true;
      observer.disconnect();
      reducedMotion.removeEventListener("change", sync);
      scene?.dispose();
    };
  }, []);

  return (
    <div className="hero-ballpit" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="hero-ballpit-shade" />
    </div>
  );
}
