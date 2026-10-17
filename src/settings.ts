import { AUTO, findLanguage } from "./highlighter/languages";
import { DEFAULT_THEME_ID, THEMES } from "./highlighter/themes";

export interface Settings {
  /** A language id, or AUTO to detect each cell's language. */
  languageId: string;
  themeId: string;
  fontName: string;
  /** Point size for highlighted cells; null keeps each cell's current size. */
  fontSize: number | null;
  fillBackground: boolean;
  fitColumns: boolean;
  autofitRows: boolean;
  autoHighlight: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  languageId: AUTO,
  themeId: DEFAULT_THEME_ID,
  fontName: "Consolas",
  fontSize: null,
  fillBackground: true,
  fitColumns: true,
  autofitRows: true,
  autoHighlight: true,
};

export const FONTS = ["Consolas", "Cascadia Mono", "Cascadia Code", "Courier New", "Lucida Console", "Menlo", "Monaco"];
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16];

export const SETTINGS_KEY = "codeHighlighter.settings";

// Preferences follow the user across workbooks, so they live in the add-in's
// own storage rather than in any one document. Storage can be unavailable
// (private mode, blocked site data), in which case defaults apply.
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return sanitize({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // settings simply won't persist
  }
}

/** Replaces values a newer or older version saved that this one doesn't know. */
function sanitize(s: Settings): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    languageId: s.languageId === AUTO || findLanguage(String(s.languageId)) ? s.languageId : d.languageId,
    themeId: THEMES.some((t) => t.id === s.themeId) ? s.themeId : d.themeId,
    fontName: FONTS.includes(s.fontName) ? s.fontName : d.fontName,
    fontSize: s.fontSize === null || FONT_SIZES.includes(s.fontSize) ? s.fontSize : d.fontSize,
    fillBackground: typeof s.fillBackground === "boolean" ? s.fillBackground : d.fillBackground,
    fitColumns: typeof s.fitColumns === "boolean" ? s.fitColumns : d.fitColumns,
    autofitRows: typeof s.autofitRows === "boolean" ? s.autofitRows : d.autofitRows,
    autoHighlight: typeof s.autoHighlight === "boolean" ? s.autoHighlight : d.autoHighlight,
  };
}
