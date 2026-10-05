/**
 * Tiny Levenshtein helper for "did you mean" suggestions (C2).
 * No dependency: distance <= 2 counts as a match.
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = diagonal + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1);
      const insertion = (prev[j] as number) + 1;
      const deletion = (prev[j - 1] as number) + 1;
      const best = Math.min(substitution, insertion, deletion);
      diagonal = prev[j] as number;
      prev[j] = best;
    }
  }
  return prev[b.length] as number;
}

export const SUGGESTION_MAX_DISTANCE = 2;

export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined = undefined;
  let bestDistance = SUGGESTION_MAX_DISTANCE + 1;
  for (const candidate of candidates) {
    const distance = levenshtein(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= SUGGESTION_MAX_DISTANCE ? best : undefined;
}

export function suggestAll(
  input: string,
  candidates: readonly string[],
  maxResults = 3,
): string[] {
  const scored = candidates
    .map((candidate) => ({ candidate, distance: levenshtein(input, candidate) }))
    .filter((entry) => entry.distance <= SUGGESTION_MAX_DISTANCE)
    .sort((a, b) => a.distance - b.distance || (a.candidate < b.candidate ? -1 : 1));
  return scored.slice(0, maxResults).map((entry) => entry.candidate);
}
