import { z } from "zod";

/**
 * Dependency allowlist (MASTER_PROMPT Section 4.1).
 * A component's `dependencies` may only reference these packages.
 * Unknown package -> build error.
 */
export const ALLOWED_DEPENDENCIES = [
  "motion",
  "framer-motion",
  "gsap",
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "ogl",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "lucide-react",
] as const;

export type AllowedDependency = (typeof ALLOWED_DEPENDENCIES)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_DEPENDENCIES);

export function isAllowedDependency(name: string): boolean {
  return ALLOWED_SET.has(name);
}

export const AllowedDependencySchema = z
  .string()
  .refine(
    (name) => isAllowedDependency(name),
    `unknown dependency (must be one of: ${ALLOWED_DEPENDENCIES.join(", ")})`,
  );
