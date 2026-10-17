import { NEWLINE, Scanner } from "../scanner";
import { scoreSignals } from "../signals";
import type { Language } from "../types";

const HUNK = /@@ [^@\r\n]* @@/y;
const FILE_HEADER = /(?:---|\+\+\+) (?=\S)/y;
const META = /(?:diff |index |new file mode|deleted file mode|similarity index|rename (?:from|to)|old mode|new mode|Binary files|Only in )/y;

/** Unified and git diffs, one line at a time. */
class DiffLexer extends Scanner {
  protected step(): void {
    if (this.eat(NEWLINE, "plain", false)) return;
    const line = this.restOfLine();
    const ch = line[0];
    let type: "inserted" | "deleted" | "keyword" | "comment" | "constant" | "plain" = "plain";
    const hunk = this.match(HUNK);
    if (hunk) {
      this.emit("interpolation", hunk);
      this.pos += hunk.length;
      this.emit("plain", line.slice(hunk.length)); // the function context after @@
      this.pos += line.length - hunk.length;
      return;
    }
    if (this.match(FILE_HEADER)) type = "keyword";
    else if (this.match(META)) type = "comment";
    else if (ch === "+") type = "inserted";
    else if (ch === "-") type = "deleted";
    else if (ch === "!") type = "constant";
    else if (ch === "\\") type = "comment"; // \ No newline at end of file
    this.emit(type, line);
    this.pos += line.length;
  }
}

export const diff: Language = {
  id: "diff",
  name: "Diff / patch",
  tokenize: (source) => new DiffLexer(source).run(),
  score: (source) =>
    scoreSignals(source, [
      { weight: 8, pattern: /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m },
      { weight: 8, pattern: /^diff --git a\// },
      { weight: 6, pattern: /^--- \S.*\r?\n\+\+\+ \S/m },
      { weight: 3, pattern: /^Index: \S/m },
    ]),
  sample: `diff --git a/app.py b/app.py
index 3b18e51..a9c2f04 100644
--- a/app.py
+++ b/app.py
@@ -10,7 +10,8 @@ def total(items):
-    return sum(items)
+    clean = [i for i in items if i is not None]
+    return sum(clean)
 # end of file`,
};
