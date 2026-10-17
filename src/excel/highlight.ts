/* eslint-disable office-addins/no-context-sync-in-loop -- ranges are processed one chunk per
   request on purpose: Excel on the web rejects any request over 5 MB. */
import { AUTO, detectLanguage, getLanguage, guessLanguage } from "../highlighter/languages";
import { buildRuns, type StyledRun } from "../highlighter/runs";
import { getTheme, THEMES, type Theme } from "../highlighter/themes";
import type { Language } from "../highlighter/types";
import { FONTS, type Settings } from "../settings";

/** Cells per range the add-in will look at; larger selections are refused rather than freezing Excel. */
const MAX_CELLS = 50000;
/** Cells read and written per request. Requests that are still too big are split further. */
const CHUNK_CELLS = 1000;
/** Widest column the add-in will create, in points. */
const MAX_COLUMN_WIDTH = 800;
/**
 * Width allowed per character, as a fraction of the font size. Monospace fonts
 * advance about 0.55em, but below 100% zoom Excel lays text out up to ~12%
 * wider; without headroom the longest line wraps into a hidden second line.
 */
const CHAR_WIDTH_EM = 0.62;
const COLUMN_PADDING = 18;
const TAB_WIDTH = 4;

const THEME_BACKGROUNDS = new Set(THEMES.map((t) => t.background.toUpperCase()));
const CODE_FONTS = new Set(FONTS.map((f) => f.toLowerCase()));

export interface Outcome {
  highlighted: number;
  scanned: number;
  /** Highlighted cells per language name. */
  languages: Record<string, number>;
}

export class TooManyCellsError extends Error {
  constructor(count: number) {
    super(`That range has ${count.toLocaleString()} cells; select at most ${MAX_CELLS.toLocaleString()}.`);
    this.name = "TooManyCellsError";
  }
}

export class ProtectedSheetError extends Error {
  constructor() {
    super("This sheet is protected. Unprotect it (Review › Unprotect Sheet) to change its formatting.");
    this.name = "ProtectedSheetError";
  }
}

/**
 * Highlights every text cell in the selection, in the language chosen in the
 * settings, or the likeliest language per cell when that setting is Auto.
 */
export async function highlightSelection(settings: Settings): Promise<Outcome> {
  return Excel.run(async (context) => {
    const total = emptyOutcome();
    for (const area of await selectedAreas(context)) {
      add(total, await highlightRange(context, area, settings, false));
    }
    return total;
  });
}

/** Finds and highlights every cell on the active sheet that looks like code. */
export async function highlightActiveSheet(settings: Settings): Promise<Outcome> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    return highlightRange(context, sheet.getRange(), settings, true);
  });
}

/** Re-highlights a range that just changed; used by auto-highlight. */
export async function highlightChanged(worksheetId: string, address: string, settings: Settings): Promise<Outcome> {
  return Excel.run(async (context) => {
    const range = context.workbook.worksheets.getItem(worksheetId).getRange(address);
    return highlightRange(context, range, settings, true);
  });
}

/**
 * Undoes the add-in's formatting on the selected cells it highlighted (those in
 * one of its code fonts): plain text in the workbook's Normal font, no theme fill.
 */
export async function clearSelection(): Promise<number> {
  return Excel.run(async (context) => {
    // The built-in style's name can be localized; without it, fonts keep their name and size.
    const normal = context.workbook.styles.getItemOrNullObject("Normal");
    await context.sync();
    const font: Excel.CellPropertiesFont = { bold: false, italic: false, color: "#000000" };
    if (!normal.isNullObject) {
      normal.font.load("name, size, color");
      await context.sync();
      Object.assign(font, { name: normal.font.name, size: normal.font.size, color: normal.font.color });
    }

    let cleared = 0;
    for (const area of await selectedAreas(context)) {
      cleared += await forEachChunk(context, area, async (chunk) => {
        const props = chunk.getCellProperties({ format: { font: { name: true }, fill: { color: true } } });
        chunk.load("formulas, valueTypes");
        await context.sync();
        let count = 0;
        const updates = chunk.formulas.map((row, r) =>
          row.map((formula, c): Excel.SettableCellProperties => {
            const text = codeText(formula, chunk.valueTypes[r][c]);
            const format = props.value[r][c].format;
            if (text === null || !CODE_FONTS.has((format?.font?.name ?? "").toLowerCase())) return {};
            if (THEME_BACKGROUNDS.has((format?.fill?.color ?? "").toUpperCase())) chunk.getCell(r, c).format.fill.clear();
            count++;
            return { format: { font, wrapText: false, verticalAlignment: "Bottom" }, textRuns: [{ text, font }] };
          })
        );
        if (count) {
          chunk.setCellProperties(updates);
          await context.sync();
        }
        return count;
      });
    }
    return cleared;
  });
}

async function selectedAreas(context: Excel.RequestContext): Promise<Excel.Range[]> {
  const areas = context.workbook.getSelectedRanges().areas;
  areas.load("items");
  await context.sync();
  return areas.items;
}

/** With `detect`, only cells that clearly look like code are touched, each in its detected language. */
async function highlightRange(
  context: Excel.RequestContext,
  range: Excel.Range,
  settings: Settings,
  detect: boolean
): Promise<Outcome> {
  const theme = getTheme(settings.themeId);
  const format = cellFormat(theme, settings);
  const outcome = emptyOutcome();
  const widest = new Map<number, { column: Excel.Range; chars: number }>(); // by sheet column index
  const toFit: { chunk: Excel.Range; rows: number[] }[] = [];

  outcome.scanned = await forEachChunk(context, range, async (chunk, rowCount, columnCount) => {
    // Turning the fill option off also takes back a fill the add-in applied earlier.
    const fills = settings.fillBackground ? null : chunk.getCellProperties({ format: { fill: { color: true } } });
    chunk.load("formulas, valueTypes, columnIndex");
    await context.sync();

    const formats: Excel.SettableCellProperties[][] = [];
    const runs: Excel.SettableCellProperties[][] = [];
    const rows: number[] = [];
    const languages: Record<string, number> = {};
    const columns = new Map<number, { column: Excel.Range; chars: number }>();
    let highlighted = 0;

    chunk.formulas.forEach((row, r) => {
      const formatRow: Excel.SettableCellProperties[] = [];
      const runRow: Excel.SettableCellProperties[] = [];
      row.forEach((formula, c) => {
        const text = codeText(formula, chunk.valueTypes[r][c]);
        const language = text === null ? null : pickLanguage(text, settings, detect);
        if (text === null || !language) {
          formatRow.push({});
          runRow.push({});
          return;
        }
        formatRow.push({ format });
        runRow.push({ textRuns: textRuns(text, language, theme, settings) });
        if (fills && THEME_BACKGROUNDS.has((fills.value[r][c].format?.fill?.color ?? "").toUpperCase())) {
          chunk.getCell(r, c).format.fill.clear();
        }
        languages[language.name] = (languages[language.name] ?? 0) + 1;
        const index = chunk.columnIndex + c;
        const chars = lineWidth(text);
        if (chars > (columns.get(index)?.chars ?? 0)) columns.set(index, { column: chunk.getColumn(c), chars });
        if (rows[rows.length - 1] !== r) rows.push(r);
        highlighted++;
      });
      formats.push(formatRow);
      runs.push(runRow);
    });

    if (highlighted) {
      // Base format first so it can't repaint the coloured runs applied after it.
      chunk.setCellProperties(formats);
      chunk.setCellProperties(runs);
      await context.sync();
      // Only count a chunk once it is written; a chunk that's split and retried counts its halves.
      outcome.highlighted += highlighted;
      for (const [name, count] of Object.entries(languages)) outcome.languages[name] = (outcome.languages[name] ?? 0) + count;
      for (const [index, entry] of columns) if (entry.chars > (widest.get(index)?.chars ?? 0)) widest.set(index, entry);
      toFit.push({ chunk, rows });
    }
    return rowCount * columnCount;
  });

  if (outcome.highlighted && (settings.fitColumns || settings.autofitRows)) {
    if (settings.fitColumns) await widenColumns(context, [...widest.values()], settings);
    // Row heights depend on column widths, so rows are fitted after widening.
    if (settings.autofitRows) for (const { chunk, rows } of toFit) autofit(chunk, rows);
    await context.sync();
  }
  return outcome;
}

/**
 * Runs `work` over the used part of `range` in row chunks small enough for
 * Excel's request size limit (5 MB on the web), splitting any chunk Excel
 * still rejects. Returns the sum of what `work` returns.
 */
async function forEachChunk(
  context: Excel.RequestContext,
  range: Excel.Range,
  work: (chunk: Excel.Range, rowCount: number, columnCount: number) => Promise<number>
): Promise<number> {
  const used = range.getUsedRangeOrNullObject(true);
  used.load("rowCount, columnCount");
  const protection = range.worksheet.protection;
  protection.load("protected");
  await context.sync();
  if (used.isNullObject) return 0;
  if (protection.protected) throw new ProtectedSheetError();
  const cells = used.rowCount * used.columnCount;
  if (cells > MAX_CELLS) throw new TooManyCellsError(cells);

  const columns = used.columnCount;
  const run = async (first: number, count: number): Promise<number> => {
    const chunk = used.getCell(first, 0).getResizedRange(count - 1, columns - 1);
    try {
      return await work(chunk, count, columns);
    } catch (error) {
      if (count > 1 && isPayloadTooLarge(error)) {
        const half = Math.ceil(count / 2);
        return (await run(first, half)) + (await run(first + half, count - half));
      }
      throw error;
    }
  };

  const rowsPerChunk = Math.max(1, Math.floor(CHUNK_CELLS / columns));
  let total = 0;
  for (let first = 0; first < used.rowCount; first += rowsPerChunk) {
    total += await run(first, Math.min(rowsPerChunk, used.rowCount - first));
  }
  return total;
}

function isPayloadTooLarge(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return code === "RequestPayloadSizeLimitExceeded" || code === "ResponsePayloadSizeLimitExceeded";
}

/** Fits the given rows of `chunk`, one contiguous run of rows at a time. */
function autofit(chunk: Excel.Range, rows: number[]): void {
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
    chunk.getRow(rows[i]).getResizedRange(rows[j] - rows[i], 0).format.autofitRows();
    i = j + 1;
  }
}

async function widenColumns(
  context: Excel.RequestContext,
  columns: { column: Excel.Range; chars: number }[],
  settings: Settings
): Promise<void> {
  for (const { column } of columns) column.format.load("columnWidth");
  await context.sync();
  const fontSize = settings.fontSize ?? 11;
  for (const { column, chars } of columns) {
    const wanted = Math.min(MAX_COLUMN_WIDTH, Math.ceil(chars * fontSize * CHAR_WIDTH_EM + COLUMN_PADDING));
    if (wanted > column.format.columnWidth) column.format.columnWidth = wanted;
  }
}

function pickLanguage(text: string, settings: Settings, detect: boolean): Language | null {
  if (detect) return detectLanguage(text);
  return settings.languageId === AUTO ? guessLanguage(text) : getLanguage(settings.languageId);
}

/**
 * The cell's text if it is a typed-in string worth highlighting, else null.
 * `formulas` holds the typed text for constants, so it doubles as the value.
 */
function codeText(formula: unknown, valueType: Excel.RangeValueType): string | null {
  if (valueType !== "String" || typeof formula !== "string" || formula.trim() === "") return null;
  if (formula.startsWith("=")) return null; // formula results can't hold rich text
  return formula;
}

function cellFormat(theme: Theme, settings: Settings): Excel.CellPropertiesFormat {
  const format: Excel.CellPropertiesFormat = {
    font: { name: settings.fontName, color: theme.foreground, bold: false, italic: false },
    wrapText: true,
    verticalAlignment: "Top",
  };
  if (settings.fontSize) format.font!.size = settings.fontSize;
  if (settings.fillBackground) format.fill = { color: theme.background };
  return format;
}

function textRuns(text: string, language: Language, theme: Theme, settings: Settings): Excel.RangeTextRun[] {
  let runs: StyledRun[] | null = null;
  try {
    runs = buildRuns(language.tokenize(text), theme);
  } catch (error) {
    console.warn(`${language.name} lexer failed; showing plain text`, error);
  }
  // Excel rejects runs that don't spell the cell exactly; a lexer bug must never cost the user a cell.
  if (!runs || runs.map((run) => run.text).join("") !== text) {
    runs = [{ text, color: theme.foreground, bold: false, italic: false }];
  }
  return runs.map((run) => {
    const font: Excel.CellPropertiesFont = {
      name: settings.fontName,
      color: run.color,
      bold: run.bold,
      italic: run.italic,
    };
    if (settings.fontSize) font.size = settings.fontSize;
    return { text: run.text, font };
  });
}

/** Display width of the widest line, counting a tab as TAB_WIDTH columns. */
function lineWidth(text: string): number {
  let widest = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    widest = Math.max(widest, line.replace(/\t/g, " ".repeat(TAB_WIDTH)).length);
  }
  return widest;
}

function emptyOutcome(): Outcome {
  return { highlighted: 0, scanned: 0, languages: {} };
}

function add(total: Outcome, part: Outcome): void {
  total.highlighted += part.highlighted;
  total.scanned += part.scanned;
  for (const [name, count] of Object.entries(part.languages)) {
    total.languages[name] = (total.languages[name] ?? 0) + count;
  }
}
