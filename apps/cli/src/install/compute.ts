/**
 * Missing-dependency computation (E4). Reads package.json deps + installed
 * node_modules versions; decides install / skip / warn-manual per package.
 */
import {
  doSemverRangesIntersect,
  isSemverSubset,
  satisfiesSemverRange,
} from "@framebits/shared";

export interface DeclaredPackages {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export type DepDecision =
  | { name: string; action: "install"; range: string }
  | { name: string; action: "skip"; reason: string }
  | { name: string; action: "warn-manual"; detail: string };

export interface ComputeInput {
  /** First-seen range wins; all ranges per package (argument order). */
  needed: Array<{ name: string; range: string }>;
  declared: DeclaredPackages;
  /** Installed versions keyed by package name (absent = not installed). */
  installed: ReadonlyMap<string, string>;
}

export function computeMissing(input: ComputeInput): {
  decisions: DepDecision[];
  warnings: string[];
} {
  const firstRange = new Map<string, string>();
  const allRanges = new Map<string, string[]>();
  for (const { name, range } of input.needed) {
    if (!firstRange.has(name)) firstRange.set(name, range);
    const list = allRanges.get(name) ?? [];
    list.push(range);
    allRanges.set(name, list);
  }

  const decisions: DepDecision[] = [];
  const warnings: string[] = [];
  for (const name of [...firstRange.keys()].sort()) {
    const range = firstRange.get(name) as string;
    const ranges = allRanges.get(name) as string[];
    for (let i = 1; i < ranges.length; i++) {
      const later = ranges[i] as string;
      if (!doSemverRangesIntersect(range, later)) {
        warnings.push(
          `package "${name}" is needed as both ${JSON.stringify(range)} and ${JSON.stringify(later)} (do not intersect); installing ${JSON.stringify(range)}`,
        );
      }
    }
    const declaredRange = input.declared.dependencies[name] ??
      input.declared.devDependencies[name] ??
      input.declared.peerDependencies[name];
    const installed = input.installed.get(name);
    if (declaredRange === undefined) {
      decisions.push({ name, action: "install", range });
      continue;
    }
    if (installed !== undefined) {
      if (satisfiesSemverRange(installed, range)) {
        decisions.push({ name, action: "skip", reason: `installed ${installed} satisfies ${range}` });
      } else {
        decisions.push({
          name,
          action: "warn-manual",
          detail: `declared ${declaredRange} (installed ${installed}) does not satisfy needed ${range}; left untouched`,
        });
      }
      continue;
    }
    if (isSemverSubset(declaredRange, range)) {
      decisions.push({ name, action: "skip", reason: `declared ${declaredRange} is within needed ${range}` });
    } else if (!doSemverRangesIntersect(declaredRange, range)) {
      // No intersection at all: declared and needed accept disjoint sets —
      // warn loudly and leave untouched with a manual command.
      warnings.push(
        `package "${name}" declared as ${JSON.stringify(declaredRange)} does not intersect needed ${JSON.stringify(range)}; leaving untouched`,
      );
      decisions.push({
        name,
        action: "warn-manual",
        detail: `declared ${declaredRange} does not intersect needed ${range}; left untouched`,
      });
    } else {
      decisions.push({
        name,
        action: "warn-manual",
        detail: `declared ${declaredRange} does not satisfy needed ${range}; left untouched`,
      });
    }
  }
  return { decisions, warnings };
}
