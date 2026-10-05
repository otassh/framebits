"use client";

// shimmer-button
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function ShimmerButton({ label, className, ...rest }: ShimmerButtonProps) {
  return (
    <button className={cn("animate-shimmer motion-reduce:animate-none", className)} {...rest}>
      <span>{label}</span>
    </button>
  );
}
