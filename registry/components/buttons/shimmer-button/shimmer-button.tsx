"use client";

// shimmer-button
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ShimmerButtonRadius = "none" | "sm" | "md" | "lg" | "full";

const RADIUS_CLASSES: Record<ShimmerButtonRadius, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

export interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Sweep duration in seconds (matches the 2s `animate-shimmer` default). */
  duration?: number;
  /** Shimmer angle in degrees. */
  angle?: number;
  /** Width of the highlight band in percent (20 reproduces the 40/50/60 stops). */
  shimmerWidth?: number;
  /** Base surface color (default slate-950). */
  background?: string;
  /** Moving highlight color (default slate-500). */
  highlight?: string;
  /** Label color (default slate-50). */
  textColor?: string;
  /** Corner radius preset. */
  radius?: ShimmerButtonRadius;
  /** Disabled state (also available via the native button attribute). */
  disabled?: boolean;
}

export function ShimmerButton({
  label,
  className,
  type = "button",
  duration = 2,
  angle = 110,
  shimmerWidth = 20,
  background = "#020617",
  highlight = "#475569",
  textColor = "#f8fafc",
  radius = "full",
  disabled = false,
  ...rest
}: ShimmerButtonProps) {
  // Runtime colors cannot use Tailwind's static gradient utilities, so the
  // sweep is built as an inline style (arbitrary hex values work here). The
  // sweep distance still comes from the `animate-shimmer` keyframes in
  // styles.json; only the pace is overridden to match `duration`.
  // Note: theming is now fully explicit via props (single theme). The previous
  // `dark:` variant classes were removed: in dark mode the button previously
  // rendered inverted, now it renders the standard dark pill unless lighter
  // colors are passed.
  const half = Math.min(50, Math.max(0, shimmerWidth / 2));
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium",
        RADIUS_CLASSES[radius],
        "bg-[length:200%_100%]",
        "animate-shimmer motion-reduce:animate-none",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${background} ${50 - half}%, ${highlight} 50%, ${background} ${50 + half}%)`,
        animationDuration: `${duration}s`,
        color: textColor,
      }}
      {...rest}
    >
      <span>{label}</span>
    </button>
  );
}
