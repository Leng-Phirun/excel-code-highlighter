import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language } from "../types";

const CONTROL = new Set([
  "begin", "break", "catch", "continue", "data", "default", "do", "dynamicparam", "else",
  "elseif", "end", "exit", "finally", "for", "foreach", "from", "if", "in", "process", "return",
  "switch", "throw", "trap", "try", "until", "using", "while", "parallel", "sequence",
]);
const STORAGE = new Set(["function", "filter", "class", "enum", "param", "workflow", "configuration", "hidden", "static"]);
const OPERATOR_WORD =
  /^-(?:[ci]?(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin|replace|split)|join|and|or|not|xor|band|bor|bnot|bxor|shl|shr|is|isnot|as|f)$/i;
const VERBS = [
  "Add", "Approve", "Assert", "Backup", "Block", "Build", "Checkpoint", "Clear", "Close", "Compare",
  "Complete", "Compress", "Confirm", "Connect", "Convert", "ConvertFrom", "ConvertTo", "Copy",
  "Debug", "Deny", "Deploy", "Disable", "Disconnect", "Dismount", "Edit", "Enable", "Enter", "Exit",
  "Expand", "Export", "Find", "ForEach", "Format", "Get", "Grant", "Group", "Import", "Initialize",
  "Install", "Invoke", "Join", "Limit", "Lock", "Measure", "Merge", "Mount", "Move", "New", "Open",
  "Optimize", "Out", "Pop", "Protect", "Publish", "Push", "Read", "Receive", "Redo", "Register",
  "Remove", "Rename", "Repair", "Request", "Reset", "Resize", "Resolve", "Restart", "Restore",
  "Resume", "Revoke", "Save", "Search", "Select", "Send", "Set", "Show", "Sort", "Split", "Start",
  "Stop", "Submit", "Suspend", "Switch", "Sync", "Test", "Trace", "Unblock", "Undo", "Uninstall",
  "Unlock", "Unprotect", "Unpublish", "Unregister", "Update", "Use", "Wait", "Watch", "Where", "Write",
].join("|");

const PROMPT = /PS [^>\r\n]*>[ \t]?/y;
const CONTINUATION = /`(?:\r\n|\r|\n)/y;
const ESCAPE = /`(?:[0abefnrtv'"`$]|u\{[0-9a-fA-F]+\})/y;
const VARIABLE = /\$(?:[A-Za-z_]\w*:)?[A-Za-z_]\w*|\$[$?^_]/y;
const BRACED_VARIABLE = /\$\{[^}\r\n]*\}?/y;
const SPLAT = /@[A-Za-z_]\w*/y;
const TYPE_LITERAL = /\[[A-Za-z_][\w.`]*(?:\[[\w.,\s]*\])?\]/y;
const NUMBER = /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[kKmMgGtTpP][bB])?[dDlL]?/y;
const PARAMETER = /-[A-Za-z_][\w-]*:?/y;
const PATH = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|~[\\/]|\\\\)[^\s|;,(){}'"`]*/y;
const WORD = /[A-Za-z_][\w]*(?:-[A-Za-z_][\w]*)*/y;
const OPERATOR = /::|\.\.|\+\+|--|&&|\|\||[-+*/%]=|\d?>>?(?:&\d)?|\*>|==|[-+*/%=!|&<>]/y;
const CALL = /\(/y;
const HASH_KEY = /[ \t]*=(?!=)/y;

class PowerShellLexer extends Scanner {
  private cmd = true;
  private lineStart = true;

  protected step(): void {
    const src = this.src;
    const ch = src[this.pos];

    const newline = this.match(NEWLINE);
    if (newline) {
      this.emit("plain", newline, false);
      this.pos += newline.length;
      this.cmd = true;
      this.lineStart = true;
      return;
    }
    if (this.eat(SPACE, "plain", false) || this.eat(CONTINUATION, "plain", false)) return;
    if (this.lineStart) {
      this.lineStart = false;
      if (this.eat(PROMPT, "comment", false)) return;
    }
    if (this.at("<#")) {
      this.lexDelimited({ open: "<#", close: "#>", type: "comment", multiline: true });
      return;
    }
    if (ch === "#") {
      this.lineComment();
      return;
    }

    if (this.at('@"')) {
      this.doubleQuoted('@"', '"@');
      return;
    }
    if (this.at("@'")) {
      this.lexDelimited({ open: "@'", close: "'@", multiline: true });
      this.cmd = false;
      return;
    }
    if (ch === '"') {
      this.doubleQuoted('"', '"');
      return;
    }
    if (ch === "'") {
      this.lexDelimited({ open: "'", close: "'", multiline: true, doubledClose: true });
      this.cmd = false;
      return;
    }
    if (ch === "$" && this.expansion()) {
      this.cmd = false;
      return;
    }
    if (ch === "@") {
      if (src[this.pos + 1] === "(" || src[this.pos + 1] === "{") {
        this.emit("operator", "@");
        this.pos++;
        return;
      }
      if (this.eat(SPLAT, "variable")) return;
    }
    if (ch === "[" && !/[\w)\]]/.test(src.charAt(this.pos - 1)) && this.eat(TYPE_LITERAL, "type")) return;

    const wordStart = this.pos === 0 || /[\s;|(){},=]/.test(src[this.pos - 1]);
    if (wordStart) {
      const path = this.match(PATH);
      if (path) {
        this.emit(this.cmd ? "function" : "plain", path);
        this.pos += path.length;
        this.cmd = false;
        return;
      }
    }
    if (ch === "-") {
      const param = this.match(PARAMETER);
      if (param) {
        this.emit(OPERATOR_WORD.test(param) ? "keyword" : "attribute", param);
        this.pos += param.length;
        return;
      }
    }
    if (/\d|\./.test(ch) && !/[\w$]/.test(src.charAt(this.pos - 1)) && this.eat(NUMBER, "number")) {
      this.cmd = false;
      return;
    }

    const word = this.match(WORD);
    if (word) {
      this.pos += word.length;
      this.emit(this.classify(word), word);
      return;
    }

    if (ch === "(" || ch === "{" || ch === "[") {
      this.openBracket();
      if (ch !== "[") this.cmd = true;
      return;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      this.closeBracket();
      this.cmd = false;
      return;
    }
    const op = this.eat(OPERATOR, "operator");
    if (op) {
      if (op === "|" || op === "&&" || op === "||" || op === "&") this.cmd = true;
      return;
    }
    if (ch === ";" || ch === "," || ch === ".") {
      this.emit("punctuation", ch);
      this.pos++;
      if (ch === ";") this.cmd = true;
      return;
    }
    this.other();
  }

  private classify(word: string): "control" | "storage" | "function" | "variable" | "property" | "plain" {
    const lower = word.toLowerCase();
    const prev = this.prev;
    CALL.lastIndex = this.pos;
    const call = CALL.test(this.src);
    if (prev && (prev.text === "." || prev.text === "::")) return call ? "function" : "variable";
    // A bare word before `=` can only be a hashtable key: @{ Name = $u.Name; Email = $u.Mail }
    HASH_KEY.lastIndex = this.pos;
    if (HASH_KEY.test(this.src)) {
      this.cmd = false;
      return "property";
    }
    if (CONTROL.has(lower)) {
      this.cmd = lower === "else" || lower === "try" || lower === "finally" || lower === "do";
      return "control";
    }
    if (STORAGE.has(lower)) return "storage";
    if (prev && prev.type === "storage" && /^(?:function|filter|workflow)$/i.test(prev.text)) return "function";
    const wasCommand = this.cmd;
    this.cmd = false;
    if (wasCommand || call || /^[A-Za-z]+-[A-Za-z]/.test(word)) return "function";
    return "plain";
  }

  private doubleQuoted(open: string, close: string): void {
    this.lexDelimited({
      open,
      close,
      multiline: true,
      escape: ESCAPE,
      escapeChar: "`",
      doubledClose: close === '"',
      stops: "$",
      inner: () => this.expansion(),
    });
    this.cmd = false;
  }

  /** `$var`, `${var}`, `$env:NAME` or a `$(...)` subexpression at the current position. */
  private expansion(): boolean {
    if (this.at("$(")) {
      this.emit("interpolation", "$(");
      this.pos += 2;
      const saved = this.cmd;
      this.cmd = true;
      const depth = this.depth;
      // Past the nesting limit the inner text is lexed by the enclosing loop instead.
      this.nested(() => {
        while (this.pos < this.src.length && !(this.src[this.pos] === ")" && this.depth === depth)) {
          const before = this.pos;
          this.step();
          if (this.pos === before) this.other();
        }
        if (this.src[this.pos] === ")") {
          this.emit("interpolation", ")");
          this.pos++;
        }
      });
      this.cmd = saved;
      return true;
    }
    if (this.eat(BRACED_VARIABLE, "variable")) return true;
    const v = this.match(VARIABLE);
    if (!v) return false;
    this.emit(/^\$(?:true|false|null)$/i.test(v) ? "constant" : "variable", v);
    this.pos += v.length;
    return true;
  }
}

const SIGNALS: Signal[] = [
  // "Write-Off approved" is a note; "Get-Process", "Get-Item -Path x" and "Import-Module Az" are cmdlets.
  { weight: 2, pattern: new RegExp(`\\b(?:${VERBS})-[A-Z][A-Za-z]+\\b`) },
  {
    weight: 3,
    pattern: new RegExp(
      `\\b(?:${VERBS})-[A-Z][A-Za-z]+(?=[ \\t]*$|[ \\t]*\\||[ \\t]+(?:-[A-Za-z]|\\$|["'@(]|[A-Za-z]:\\\\|\\.{1,2}\\\\|[A-Z][\\w.]*[ \\t]*$))`,
      "m"
    ),
  },
  { weight: 4, pattern: /^PS [A-Za-z]:\\[^>\n]*>/m },
  { weight: 3, pattern: /\$(?:_|PSItem|env:\w+|PSScriptRoot|PSVersionTable|true|false|null)\b/ },
  { weight: 2, pattern: /\[(?:string|int|bool|switch|object|array|hashtable|PSCustomObject|datetime|System\.[\w.]+)(?:\[\])?\]\s*\$/i },
  { weight: 2, pattern: /\s-(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|replace|and|or)\s/ },
  { weight: 2, pattern: /\|\s*(?:Where-Object|Select-Object|ForEach-Object|Sort-Object|%|\?)\s*[{-]/ },
  { weight: 1, pattern: /\s-[A-Z][a-z]+[A-Za-z]*\b/ },
  { weight: 2, pattern: /^[ \t]*param\s*\(/im },
  { weight: 1, pattern: /\$[A-Za-z_]\w*\s*=\s*/ },
  { weight: 3, pattern: /@\{\s*[\w"']+\s*=/ },
];

export const powershell: Language = {
  id: "powershell",
  name: "PowerShell",
  tokenize: (source) => new PowerShellLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `# Archive log files older than a week
param([string]$Path = "C:\\Logs", [int]$DaysOld = 7)
$cutoff = (Get-Date).AddDays(-$DaysOld)
Get-ChildItem -Path $Path -Filter *.log -Recurse |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Compress-Archive -Path $_.FullName -DestinationPath "$($_.FullName).zip"
        Write-Host "Archived $($_.Name)" -ForegroundColor Green
    }`,
};
