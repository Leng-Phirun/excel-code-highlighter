import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals } from "../signals";
import type { Language } from "../types";

const words = (list: string): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

// Windows cmd.exe batch files; everything is case-insensitive.
const KEYWORDS = words("if else for in do goto call exit not exist defined errorlevel cmdextversion");
const COMPARISONS = words("equ neq lss leq gtr geq");
const BUILTINS = words(`
  echo set setlocal endlocal cd chdir pushd popd md mkdir rd rmdir del erase copy xcopy robocopy
  move ren rename type cls title color pause shift start timeout choice ver vol path prompt dir
  find findstr where assoc ftype attrib mklink tasklist taskkill sc net reg powershell cmd
`);

const VARIABLE = /%%~?[A-Za-z]|%~[a-zA-Z$:]*[0-9]|%[0-9*]|%[^%\s\r\n"]+%|![^!\s\r\n"]+!/y;
const LABEL = /:[^\s:][^\s]*/y;
const ESCAPE = /\^[^\r\n]/uy;
const REM = /rem(?=[ \t\r\n]|$)/iy;
const OPERATOR = /\d?>>?(?:&\d)?|<|\|\||&&|==|[|&]/y;
const WORD = /[^\s"%!|&<>()^=,;]+/y;

class BatchLexer extends Scanner {
  /** At the first word of a command. */
  private cmd = true;
  private lineStart = true;
  private afterSet = false;

  protected step(): void {
    const ch = this.src[this.pos];
    const newline = this.match(NEWLINE);
    if (newline) {
      this.emit("plain", newline, false);
      this.pos += newline.length;
      this.cmd = this.lineStart = true;
      return;
    }
    if (this.eat(SPACE, "plain", false)) return;
    if (this.cmd) {
      if (this.at("::") || this.match(REM)) return this.lineComment();
      if (ch === "@") {
        this.emit("operator", ch);
        this.pos++;
        return;
      }
      if (ch === ":" && this.lineStart && this.eat(LABEL, "function")) {
        this.cmd = false;
        return;
      }
    }
    this.lineStart = false;

    if (ch === '"') {
      this.lexDelimited({ open: '"', close: '"', stops: "%!", inner: () => !!this.eat(VARIABLE, "variable") });
      this.cmd = false;
      return;
    }
    if (this.eat(VARIABLE, "variable") || this.eat(ESCAPE, "escape")) {
      this.cmd = false;
      return;
    }
    const op = this.eat(OPERATOR, "operator");
    if (op) {
      if (op === "|" || op === "&" || op === "&&" || op === "||") this.cmd = true;
      return;
    }
    if (ch === "(") {
      const forSet = this.prev?.type === "control" && this.prev.text.toLowerCase() === "in";
      this.openBracket();
      this.cmd = !forSet;
      return;
    }
    if (ch === ")") {
      this.closeBracket();
      this.cmd = false;
      return;
    }
    if (ch === "=") {
      this.emit("operator", ch);
      this.pos++;
      return;
    }
    if (ch === "," || ch === ";") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    const word = this.match(WORD);
    if (word) {
      this.pos += word.length;
      this.word(word);
      return;
    }
    this.other();
  }

  private word(w: string): void {
    const lower = w.toLowerCase();
    if (this.cmd) {
      this.cmd = false;
      if (KEYWORDS.has(lower)) {
        this.emit("control", w);
        this.cmd = lower === "do" || lower === "else";
      } else {
        this.emit(BUILTINS.has(lower) ? "builtin" : "function", w);
        this.afterSet = lower === "set";
      }
      return;
    }
    if (this.afterSet && this.src[this.pos] === "=") {
      this.afterSet = false;
      this.emit("variable", w);
    } else if (KEYWORDS.has(lower)) {
      this.emit("control", w);
      if (lower === "do" || lower === "else") this.cmd = true;
    } else if (COMPARISONS.has(lower)) {
      this.emit("keyword", w);
    } else if (/^[/-][A-Za-z?]/.test(w)) {
      this.emit("attribute", w);
    } else if (/^\d+$/.test(w)) {
      this.emit("number", w);
    } else {
      this.emit("plain", w);
    }
  }
}

export const batch: Language = {
  id: "batch",
  name: "Batch (cmd)",
  tokenize: (source) => new BatchLexer(source).run(),
  score: (source) =>
    scoreSignals(source, [
      { weight: 8, pattern: /^@echo\s+off\b/im },
      { weight: 3, pattern: /^[ \t]*(?:rem\s|::)/im },
      { weight: 4, pattern: /%[A-Za-z_]\w*%|%~[a-zA-Z]*[0-9]|%%[A-Za-z]\b/ },
      { weight: 4, pattern: /\bif\s+(?:\/i\s+)?(?:not\s+)?(?:exist|defined|errorlevel)\b/i },
      { weight: 3, pattern: /^[ \t]*set\s+\/[ap]\s/im },
      { weight: 3, pattern: /\bgoto\s+:?\w+|^:\w+[ \t]*$/im },
      { weight: 2, pattern: /\s(?:equ|neq|lss|leq|gtr|geq)\s/i },
      { weight: 2, pattern: /^[ \t]*setlocal\b/im },
      { weight: 1, pattern: /\s\/[A-Za-z]\b/ },
    ]),
  sample: `@echo off
setlocal enabledelayedexpansion
REM Back up every workbook in this folder
set "DEST=%USERPROFILE%\\Backups"
if not exist "%DEST%" mkdir "%DEST%"
for %%f in (*.xlsx) do (
    copy /Y "%%f" "%DEST%\\" >nul && echo Copied %%f
)
endlocal`,
};
