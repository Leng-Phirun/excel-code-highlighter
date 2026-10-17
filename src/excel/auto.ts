import type { Settings } from "../settings";
import { highlightChanged } from "./highlight";

let handler: OfficeExtension.EventHandlerResult<Excel.WorksheetChangedEventArgs> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Turns auto-highlight on or off while the add-in runs in this workbook.
 * While on, any cell the user types or pastes code into is highlighted as
 * soon as it changes.
 */
export async function setAutoHighlight(enabled: boolean, getSettings: () => Settings): Promise<void> {
  if (enabled && !handler) {
    await Excel.run(async (context) => {
      handler = context.workbook.worksheets.onChanged.add(async (event) => {
        // Only this user's own typing and pasting: not our own formatting
        // changes, and not co-authors' edits (their add-in handles those).
        if (event.source !== "Local" || event.triggerSource === "ThisLocalAddin") return;
        if (event.changeType !== "RangeEdited") return;
        // One change at a time, so quick successive edits don't interleave.
        queue = queue
          .then(() => highlightChanged(event.worksheetId, event.address, getSettings()))
          .catch((error) => console.warn("Auto-highlight skipped a change:", error));
        await queue;
      });
      await context.sync();
    });
  } else if (!enabled && handler) {
    const current = handler;
    handler = null;
    await Excel.run(current.context, async (context) => {
      current.remove();
      await context.sync();
    });
  }
}

/** Whether Excel starts the add-in whenever this workbook opens. */
export async function getStartWithWorkbook(): Promise<boolean> {
  return (await Office.addin.getStartupBehavior()) === Office.StartupBehavior.load;
}

/**
 * Asks Excel to start (or stop starting) the add-in when this workbook opens,
 * so auto-highlight works without clicking anything first. This is saved in
 * the workbook, so it only changes when the user asks.
 */
export async function setStartWithWorkbook(enabled: boolean): Promise<void> {
  await Office.addin.setStartupBehavior(enabled ? Office.StartupBehavior.load : Office.StartupBehavior.none);
}
