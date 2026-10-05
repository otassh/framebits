"use client";

// aurora-text
import { motion, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface AuroraTextProps extends HTMLAttributes<HTMLSpanElement> {
  text: string;
}

const GRADIENT =
  "bg-gradient-to-r from-fuchsia-500 via-sky-400 to-emerald-400 bg-[length:200%_auto] bg-clip-text text-transparent";

export function AuroraText({
  text,
  className,
  onDrag,
  onDragStart,
  onDragEnd,
  onAnimationStart,
  onAnimationEnd,
  onAnimationIteration,
  ...rest
}: AuroraTextProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return (
      <span
        className={cn(GRADIENT, className)}
        onDrag={onDrag}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onAnimationStart={onAnimationStart}
        onAnimationEnd={onAnimationEnd}
        onAnimationIteration={onAnimationIteration}
        {...rest}
      >
        {text}
      </span>
    );
  }
  // motion.span retypes drag/animation handlers, so the DOM handlers stay on the
  // static branch only; everything else passes through.
  return (
    <motion.span
      className={cn(GRADIENT, className)}
      initial={{ backgroundPosition: "0% center" }}
      animate={{ backgroundPosition: "200% center" }}
      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      {...rest}
    >
      {text}
    </motion.span>
  );
}
