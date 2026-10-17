import { getStartWithWorkbook, setAutoHighlight, setStartWithWorkbook } from "../excel/auto";
import {
  clearSelection,
  highlightActiveSheet,
  highlightSelection,
  ProtectedSheetError,
  TooManyCellsError,
  type Outcome,
} from "../excel/highlight";
import { AUTO, getLanguage, LANGUAGES } from "../highlighter/languages";
import { buildRuns } from "../highlighter/runs";
import { getTheme, THEMES } from "../highlighter/themes";
import { FONT_SIZES, FONTS, loadSettings, saveSettings, SETTINGS_KEY, type Settings } from "../settings";

/*
 * One script serves the task pane, the ribbon buttons and auto-highlight: the
 * manifest gives them a shared runtime, so this file also runs, without a
 * visible pane, when a ribbon button is clicked first.
 */

let settings: Settings = loadSettings();
const getSettings = () => settings;

// Ribbon buttons (ExecuteFunction actions in manifest.xml).
Office.actions.associate("highlightSelection", (event: Office.AddinCommands.Event) =>
  runCommand(event, async () => report(await highlightSelection(settings), "selected"))
);
Office.actions.associate("clearSelection", (event: Office.AddinCommands.Event) =>
  runCommand(event, async () => reportCleared(await clearSelection()))
);

Office.onReady(async (info) => {
  if (info.host !== Office.HostType.Excel) return;
  if (!Office.context.requirements.isSetSupported("ExcelApi", "1.18")) {
    byId("unsupported").hidden = false;
    document.querySelector<HTMLElement>(".pane")!.hidden = true;
    return;
  }
  initPane();
  if (settings.autoHighlight) {
    try {
      await setAutoHighlight(true, getSettings);
    } catch (error) {
      showStatus(`Auto-highlight could not start: ${message(error)}`, "error");
    }
  }
});

async function runCommand(event: Office.AddinCommands.Event, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(error);
    // The pane may be closed; open it so the message is seen.
    await Office.addin.showAsTaskpane().catch(() => undefined);
    showStatus(message(error), "error");
  } finally {
    event.completed();
  }
}

function initPane(): void {
  fillSelect("language", [[AUTO, "Auto-detect"], ...LANGUAGES.map((l): [string, string] => [l.id, l.name])]);
  fillSelect("theme", THEMES.map((t) => [t.id, t.name]));
  fillSelect("font", FONTS.map((f) => [f, f]));
  fillSelect("size", [["keep", "Keep"], ...FONT_SIZES.map((s): [string, string] => [String(s), String(s)])]);
  syncControls();

  const onChange = () => {
    update({
      languageId: select("language").value,
      themeId: select("theme").value,
      fontName: select("font").value,
      fontSize: select("size").value === "keep" ? null : Number(select("size").value),
      fillBackground: checkbox("fill").checked,
      fitColumns: checkbox("fit-columns").checked,
      autofitRows: checkbox("autofit-rows").checked,
    });
    renderPreview();
  };
  for (const id of ["language", "theme", "font", "size", "fill", "fit-columns", "autofit-rows"]) {
    byId(id).addEventListener("change", onChange);
  }
  // A theme whose point is its background (Light Grey) is no use without the fill.
  select("theme").addEventListener("change", () => {
    if (getTheme(select("theme").value).fillCells && !checkbox("fill").checked) {
      checkbox("fill").checked = true;
      onChange();
    }
  });

  // Each open workbook runs its own copy of the add-in; follow changes made in the others.
  window.addEventListener("storage", async (event) => {
    if (event.key !== SETTINGS_KEY) return;
    const wasAuto = settings.autoHighlight;
    settings = loadSettings();
    syncControls();
    if (settings.autoHighlight !== wasAuto) await setAutoHighlight(settings.autoHighlight, getSettings).catch(() => undefined);
  });

  const auto = checkbox("auto");
  auto.addEventListener("change", async () => {
    auto.disabled = true;
    try {
      await setAutoHighlight(auto.checked, getSettings);
      update({ autoHighlight: auto.checked });
      showStatus(auto.checked ? "Auto-highlight is on." : "Auto-highlight is off.", "success");
    } catch (error) {
      auto.checked = !auto.checked;
      showStatus(message(error), "error");
    } finally {
      auto.disabled = false;
    }
  });

  const startup = checkbox("start-with-workbook");
  getStartWithWorkbook()
    .then((on) => (startup.checked = on))
    .catch(() => (startup.disabled = true));
  startup.addEventListener("change", async () => {
    startup.disabled = true;
    try {
      await setStartWithWorkbook(startup.checked);
      showStatus(
        startup.checked
          ? "Code Highlighter will start when this workbook opens. Save the workbook to keep this."
          : "Code Highlighter will no longer start with this workbook.",
        "success"
      );
    } catch (error) {
      startup.checked = !startup.checked;
      showStatus(message(error), "error");
    } finally {
      startup.disabled = false;
    }
  });

  bindButton("highlight", async () => report(await highlightSelection(settings), "selected"));
  bindButton("highlight-sheet", async () => report(await highlightActiveSheet(settings), "sheet"));
  bindButton("clear", async () => reportCleared(await clearSelection()));
}

/** Shows the current settings in the controls. */
function syncControls(): void {
  select("language").value = settings.languageId;
  select("theme").value = settings.themeId;
  select("font").value = settings.fontName;
  select("size").value = settings.fontSize ? String(settings.fontSize) : "keep";
  checkbox("fill").checked = settings.fillBackground;
  checkbox("fit-columns").checked = settings.fitColumns;
  checkbox("autofit-rows").checked = settings.autofitRows;
  checkbox("auto").checked = settings.autoHighlight;
  renderPreview();
}

function update(patch: Partial<Settings>): void {
  // Start from what's stored, so a change made in another workbook isn't overwritten.
  settings = { ...loadSettings(), ...patch };
  saveSettings(settings);
}

function bindButton(id: string, action: () => Promise<void>): void {
  const button = byId<HTMLButtonElement>(id);
  button.addEventListener("click", async () => {
    button.disabled = true;
    showStatus("Working…");
    try {
      await action();
    } catch (error) {
      showStatus(message(error), "error");
      console.error(error);
    } finally {
      button.disabled = false;
    }
  });
}

function report({ highlighted, scanned, languages }: Outcome, scope: "selected" | "sheet"): void {
  if (highlighted > 0) {
    const names = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => (Object.keys(languages).length > 1 ? `${name} ${count}` : name))
      .join(", ");
    showStatus(`Highlighted ${plural(highlighted, "cell")} (${names}).`, "success");
  } else if (scanned === 0) {
    showStatus(scope === "sheet" ? "This sheet is empty." : "The selection is empty.");
  } else {
    showStatus(
      scope === "sheet" ? "No cells on this sheet look like code." : "The selection has no text cells to highlight."
    );
  }
}

function reportCleared(count: number): void {
  showStatus(
    count ? `Removed highlighting from ${plural(count, "cell")}.` : "No highlighted cells in the selection.",
    "success"
  );
}

function renderPreview(): void {
  const theme = getTheme(settings.themeId);
  const language = getLanguage(settings.languageId === AUTO ? "python" : settings.languageId);
  const preview = byId("preview");
  preview.style.background = settings.fillBackground ? theme.background : "#FFFFFF";
  preview.style.color = theme.foreground;
  preview.style.fontFamily = `"${settings.fontName}", Consolas, Menlo, monospace`;
  preview.replaceChildren(
    ...buildRuns(language.tokenize(language.sample), theme).map((run) => {
      const span = document.createElement("span");
      span.textContent = run.text;
      span.style.color = run.color;
      if (run.bold) span.style.fontWeight = "bold";
      if (run.italic) span.style.fontStyle = "italic";
      return span;
    })
  );
  byId("fill-warning").hidden = !(theme.dark && !settings.fillBackground);
}

function showStatus(text: string, kind: "info" | "success" | "error" = "info"): void {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = text;
  status.className = `status ${kind}`;
}

function fillSelect(id: string, options: [string, string][]): void {
  select(id).replaceChildren(
    ...options.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    })
  );
}

// Helpers are function declarations, not consts: Office.onReady can run its
// callback synchronously while this module is still loading.
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function select(id: string): HTMLSelectElement {
  return byId<HTMLSelectElement>(id);
}
function checkbox(id: string): HTMLInputElement {
  return byId<HTMLInputElement>(id);
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

/** A message a person can act on, for errors from Excel or from the add-in. */
function message(error: unknown): string {
  if (error instanceof ProtectedSheetError || error instanceof TooManyCellsError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "InvalidSelection":
      return "Select one or more cells first.";
    case "InvalidOperationInCellEditMode":
      return "Finish editing the cell (press Enter or Esc), then try again.";
    case "AccessDenied":
      return "Excel didn't allow the change. Is the sheet protected or the workbook read-only?";
    case "RequestPayloadSizeLimitExceeded":
    case "ResponsePayloadSizeLimitExceeded":
      return "That selection holds too much text to change at once. Select fewer cells and try again.";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
