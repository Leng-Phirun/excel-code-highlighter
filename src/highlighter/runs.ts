import type { Token } from "./types";
import { resolveStyle, type Theme } from "./themes";

/** A stretch of text drawn with one font; becomes one Excel RangeTextRun. */
export interface StyledRun {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Turns tokens into as few styled runs as possible: whitespace joins the run
 * before it (its colour is invisible) and neighbours with the same look merge.
 */
export function buildRuns(tokens: Token[], theme: Theme): StyledRun[] {
  const runs: StyledRun[] = [];
  for (const token of tokens) {
    const last = runs[runs.length - 1];
    const blank = token.text.trim() === "";
    if (blank && last) {
      last.text += token.text;
      continue;
    }
    const style = blank ? { color: theme.foreground } : resolveStyle(theme, token.type);
    const run: StyledRun = {
      text: token.text,
      color: style.color,
      bold: !!style.bold,
      italic: !!style.italic,
    };
    if (last && last.color === run.color && last.bold === run.bold && last.italic === run.italic) {
      last.text += run.text;
    } else {
      runs.push(run);
    }
  }
  // Never end a run between the two halves of a surrogate pair (emoji and other astral characters).
  for (let i = 1; i < runs.length; i++) {
    const before = runs[i - 1].text;
    const high = before.charCodeAt(before.length - 1);
    const low = runs[i].text.charCodeAt(0);
    if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) {
      runs[i - 1].text += runs[i].text[0];
      runs[i].text = runs[i].text.slice(1);
      if (!runs[i].text) runs.splice(i--, 1);
    }
  }
  return runs;
}
