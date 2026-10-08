"use client";

// aurora-text
import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type AuroraTextSize = "inherit" | "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE_CLASSES: Record<AuroraTextSize, string> = {
  inherit: "",
  sm: "text-sm",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
  "2xl": "text-4xl",
};

export interface AuroraTextProps extends Omit<ComponentProps<typeof motion.span>, "children"> {
  text: string;
  /** Sweep duration in seconds (matches the previous 6s look at default). */
  duration?: number;
  /** Gradient stops (any count >= 1; defaults are fuchsia-500/sky-400/emerald-400). */
  colors?: string[];
  /** Gradient angle in degrees (90 = left-to-right, as before). */
  angle?: number;
  /** Preset text size; "inherit" keeps the surrounding size, as before. */
  size?: AuroraTextSize;
  /** False renders a single sweep instead of an infinite loop. */
  loop?: boolean;
  /** True freezes the gradient at its start (same still as reduced motion). */
  paused?: boolean;
}

const DEFAULT_COLORS = ["#d946ef", "#38bdf8", "#34d399"];

export function AuroraText({
  text,
  className,
  duration = 6,
  colors = DEFAULT_COLORS,
  angle = 90,
  size = "inherit",
  loop = true,
  paused = false,
  ...rest
}: AuroraTextProps) {
  const reduceMotion = useReducedMotion();
  // Runtime colors cannot use Tailwind's static gradient utilities, so the
  // gradient is built as an inline style (arbitrary hex values work here).
  const stops = colors.length === 0 ? DEFAULT_COLORS : colors;
  const still = reduceMotion || paused;
  return (
    <motion.span
      className={cn("bg-clip-text text-transparent", SIZE_CLASSES[size], className)}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${stops.join(", ")})`,
        backgroundSize: "200% auto",
      }}
      initial={{ backgroundPosition: "0% center" }}
      animate={still ? { backgroundPosition: "0% center" } : { backgroundPosition: "200% center" }}
      transition={
        still
          ? { duration: 0 }
          : { duration, repeat: loop ? Infinity : 0, ease: "linear" }
      }
      {...rest}
    >
      {text}
    </motion.span>
  );
}
