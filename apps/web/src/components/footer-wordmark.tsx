import {
  motion,
  motionValue,
  useInView,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
  type MotionValue,
} from "motion/react";
import { useEffect, useMemo, useRef, type PointerEvent } from "react";

interface LetterTargets {
  lift: MotionValue<number>;
  tilt: MotionValue<number>;
  scale: MotionValue<number>;
  light: MotionValue<number>;
  lightX: MotionValue<number>;
  lightY: MotionValue<number>;
}

function LetterFace({
  letter,
  targets,
}: {
  letter: string;
  targets: LetterTargets;
}): React.JSX.Element {
  const spring = { stiffness: 280, damping: 26, mass: 0.55 };
  const y = useSpring(targets.lift, spring);
  const rotate = useSpring(targets.tilt, spring);
  const scale = useSpring(targets.scale, spring);
  const light = useSpring(targets.light, { stiffness: 180, damping: 25 });
  const lightX = useSpring(targets.lightX, spring);
  const lightY = useSpring(targets.lightY, spring);
  const backgroundImage = useMotionTemplate`radial-gradient(circle at ${lightX}% ${lightY}%, rgba(255, 255, 255, ${light}), transparent 75%), var(--footer-letter-base)`;

  return (
    <motion.span className="footer-letter-face" style={{ y, rotate, scale, backgroundImage }}>
      {letter}
    </motion.span>
  );
}

export function FooterWordmark(): React.JSX.Element {
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const metrics = useRef<Array<{ left: number; width: number }>>([]);
  const visible = useInView(wordmarkRef, { once: true, amount: 0.4 });
  const reducedMotion = useReducedMotion();
  const targets = useMemo(
    () =>
      Array.from("Framebits", () => ({
        lift: motionValue(0),
        tilt: motionValue(0),
        scale: motionValue(1),
        light: motionValue(0),
        lightX: motionValue(50),
        lightY: motionValue(50),
      })),
    [],
  );

  const reset = (): void => {
    for (const target of targets) {
      target.lift.set(0);
      target.tilt.set(0);
      target.scale.set(1);
      target.light.set(0);
    }
  };

  useEffect(() => {
    const wordmark = wordmarkRef.current;
    if (wordmark === null) return;
    const measure = (): void => {
      metrics.current = letterRefs.current.map((letter) => ({
        left: letter?.offsetLeft ?? 0,
        width: letter?.offsetWidth ?? 1,
      }));
      // A responsive resize should return the letters to their resting position.
      for (const target of targets) {
        target.lift.set(0);
        target.tilt.set(0);
        target.scale.set(1);
        target.light.set(0);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wordmark);
    return () => {
      observer.disconnect();
    };
  }, [targets]);

  const followPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const radius = rect.width * 0.17;
    targets.forEach((target, index) => {
      const metric = metrics.current[index];
      if (metric === undefined) return;
      const distance = (metric.left + metric.width / 2 - x) / radius;
      const proximity = Math.max(0, 1 - Math.abs(distance));
      const strength = proximity * proximity * (3 - 2 * proximity);
      target.lift.set(-strength * rect.height * 0.045);
      target.tilt.set(-distance * strength * 4);
      target.scale.set(1 + strength * 0.018);
      target.light.set(strength * 0.55);
      target.lightX.set(Math.max(0, Math.min(100, ((x - metric.left) / metric.width) * 100)));
      target.lightY.set(Math.max(0, Math.min(100, (y / rect.height) * 100)));
    });
  };

  return (
    <div
      ref={wordmarkRef}
      className="footer-wordmark"
      aria-hidden="true"
      onPointerMove={followPointer}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {targets.map((target, index) => (
        <motion.span
          key={index}
          ref={(node) => {
            letterRefs.current[index] = node;
          }}
          className={`footer-letter${index >= 5 ? " footer-letter-accent" : ""}`}
          initial={false}
          animate={{ y: visible || reducedMotion ? "0%" : "110%" }}
          transition={{
            duration: reducedMotion ? 0 : 0.85,
            delay: reducedMotion ? 0 : index * 0.045,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <LetterFace letter={"Framebits"[index] ?? ""} targets={target} />
        </motion.span>
      ))}
    </div>
  );
}
