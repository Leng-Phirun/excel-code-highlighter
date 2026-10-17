/**
 * Language detection by weighted evidence: each distinct signal that matches
 * adds its weight once, and a cell needs CODE_THRESHOLD points to count as code.
 * Signals should be strict enough that ordinary notes and labels score 0.
 */

export interface Signal {
  weight: number;
  pattern: RegExp;
}

export const CODE_THRESHOLD = 3;

export function scoreSignals(text: string, signals: Signal[]): number {
  let score = 0;
  for (const { weight, pattern } of signals) {
    if (pattern.test(text)) score += weight;
  }
  return score;
}
