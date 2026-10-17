import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals } from "../signals";
import type { Language } from "../types";

const SECTION = /\[\[?[^\]\r\n]*\]\]?/y;
const KEY = /(?:[A-Za-z0-9_-]+|"(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*')(?:[ \t]*\.[ \t]*(?:[A-Za-z0-9_-]+|"(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*'))*(?=[ \t]*[=:])/y;
const INI_KEY = /[^\s=:;#[\]{}"'][^=:\r\n]*?(?=[ \t]*[=:])/y;
const ESCAPE = /\\(?:[btnfr"\\/]|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/y;
const DATE = /\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?/y;
const NUMBER = /[+-]?(?:0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|inf|nan)(?![\w.-])/y;
const BOOLEAN = /(?:true|false)(?![\w-])/y;
const BARE = /[^\s,\]}#;=]+(?:[ \t]+[^\s,\]}#;=]+)*/y;

/** TOML, and the INI / .properties / .cfg files it grew out of. */
class TomlLexer extends Scanner {
  protected step(): void {
    if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) return;
    const ch = this.src[this.pos];
    if (ch === "#" || ch === ";") return this.lineComment();
    // Inside a multi-line array the lines hold values, not keys.
    if (this.depth === 0 && this.atLineStart()) {
      if (ch === "[" && this.eat(SECTION, "tag")) return;
      if (this.key()) return;
    }
    this.value();
  }

  private key(inline = false): boolean {
    const key = this.match(KEY) ?? (inline ? null : this.match(INI_KEY));
    if (!key) return false;
    this.emit("property", key);
    this.pos += key.length;
    this.eat(SPACE, "plain", false);
    this.emit("operator", this.src[this.pos]);
    this.pos++;
    return true;
  }

  private value(): void {
    const ch = this.src[this.pos];
    // Keys of an inline table: { a = 1, b = 2 }
    const prev = this.prev?.text ?? "";
    if (this.depth > 0 && (prev.endsWith("{") || prev === ",") && this.key(true)) return;
    if (this.at('"""')) return this.lexDelimited({ open: '"""', close: '"""', multiline: true, escape: ESCAPE });
    if (this.at("'''")) return this.lexDelimited({ open: "'''", close: "'''", multiline: true });
    if (ch === '"') return this.lexDelimited({ open: '"', close: '"', escape: ESCAPE });
    if (ch === "'") return this.lexDelimited({ open: "'", close: "'" });
    if (this.eat(DATE, "number") || this.eat(NUMBER, "number") || this.eat(BOOLEAN, "constant")) return;
    if (ch === "[" || ch === "{") return this.openBracket();
    if (ch === "]" || ch === "}") return this.closeBracket();
    if (ch === ",") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    if (this.eat(BARE, "string")) return;
    this.other();
  }
}

export const toml: Language = {
  id: "toml",
  name: "TOML / INI",
  tokenize: (source) => new TomlLexer(source).run(),
  score: (source) =>
    scoreSignals(source, [
      { weight: 3, pattern: /^[ \t]*\[[\w.\- "']+\][ \t]*$/m },
      { weight: 4, pattern: /^[ \t]*\[\[[\w.\- "']+\]\][ \t]*$/m },
      { weight: 1, pattern: /^[ \t]*[\w.-]+[ \t]*=[ \t]*(?:"[^"\n]*"|'[^'\n]*'|\d|true|false|\[)/m },
      { weight: 2, pattern: /^[ \t]*\[[\w.\- ]+\][ \t]*\r?\n[ \t]*[\w.-]+[ \t]*=/m },
      { weight: 1, pattern: /^[ \t]*;/m },
    ]),
  sample: `# pyproject.toml
[project]
name = "code-highlighter"
version = "1.3.0"
requires-python = ">=3.10"
dependencies = ["requests>=2.31", "rich"]

[tool.ruff]
line-length = 100
select = ["E", "F"]
released = 2026-10-17T09:30:00Z`,
};
