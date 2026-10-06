"use client";

// aurora-text
import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export interface AuroraTextProps extends Omit<ComponentProps<typeof motion.span>, "children"> {
  text: string;
}

const GRADIENT =
  "bg-gradient-to-r from-fuchsia-500 via-sky-400 to-emerald-400 bg-[length:200%_auto] bg-clip-text text-transparent";

export function AuroraText({ text, className, ...rest }: AuroraTextProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className={cn(GRADIENT, className)}
      initial={{ backgroundPosition: "0% center" }}
      animate={reduceMotion ? { backgroundPosition: "0% center" } : { backgroundPosition: "200% center" }}
      transition={reduceMotion ? { duration: 0 } : { duration: 6, repeat: Infinity, ease: "linear" }}
      {...rest}
    >
      {text}
    </motion.span>
  );
}
