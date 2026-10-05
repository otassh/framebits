import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and merges conflicting Tailwind classes.
 *
 * Accepts strings, arrays, and conditional objects (see `clsx`), then resolves
 * Tailwind conflicts so later classes win (see `tailwind-merge`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}
