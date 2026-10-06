"use client";

// shimmer-button
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function ShimmerButton({ label, className, type = "button", ...rest }: ShimmerButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium",
        "bg-slate-950 text-slate-50 dark:bg-slate-50 dark:text-slate-950",
        "bg-[image:linear-gradient(110deg,#020617_40%,#475569_50%,#020617_60%)] dark:bg-[image:linear-gradient(110deg,#f8fafc_40%,#cbd5e1_50%,#f8fafc_60%)]",
        "bg-[length:200%_100%]",
        "animate-shimmer motion-reduce:animate-none",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <span>{label}</span>
    </button>
  );
}
