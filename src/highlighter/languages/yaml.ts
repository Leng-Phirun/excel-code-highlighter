import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language } from "../types";

const INDENT = /[ \t]*/y;
const DOCUMENT_MARKER = /(?:---|\.\.\.)(?=[ \t]|\r|\n|$)/y;
// Key text is bounded so a long line can't be rescanned from every token.
const KEY = /(?:"(?:[^"\\\r\n]|\\.){0,200}"|'(?:[^'\r\n]|''){0,200}'|[^\s#:{}[\],&*!|>'"%@`-][^\r\n:#]{0,200}?|-[^\s\r\n:#][^\r\n:#]{0,200}?)(?=[ \t]*:(?:[ \t]|\r|\n|$))/y;
/** Inside [ ] or { } a key can't contain the delimiters: { os: [a, b], node: 18 }. */
const FLOW_KEY = /(?:"(?:[^"\\\r\n]|\\.){0,200}"|'(?:[^'\r\n]|''){0,200}'|[^\s#:{}[\],&*!|>'"%@`-][^\r\n:#,[\]{}]{0,200}?)(?=[ \t]*:(?:[ \t]|\r|\n|$))/y;
const HAS_KEY = /:(?:[ \t]|$)/;
const ANCHOR = /[&*][^\s,[\]{}]+/y;
const TAG = /![^\s,[\]{}]*/y;
const BLOCK_INDICATOR = /[|>][+-]?\d*[+-]?(?=[ \t]*(?:#|\r|\n|$))/y;
const ESCAPE = /\\(?:[0abtnvfre "/\\N_LP\t]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/y;
const NUMBER = /^[-+]?(?:\d[\d_]*(?:\.\d*)?(?:[eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i;
const CONSTANT = /^(?:true|false|yes|no|on|off|null|~)$/i;

class YamlLexer extends Scanner {
  /** Indentation of the key that opened a `|` or `>` block scalar, while inside it. */
  private block: number | null = null;
  private flow = 0;

  /** Lexes one line (or more, if a quoted string spans lines). */
  protected step(): void {
    const indent = this.match(INDENT) ?? "";
    const rest = this.restOfLine(this.pos + indent.length);
    if (this.block !== null) {
      if (rest.trim() === "" || indent.length > this.block) {
        this.emit("plain", indent, false);
        this.pos += indent.length;
        this.emit("string", rest);
        this.pos += rest.length;
        this.eat(NEWLINE, "plain", false);
        return;
      }
      this.block = null;
    }
    this.emit("plain", indent, false);
    this.pos += indent.length;
    if (this.flow === 0) this.eat(DOCUMENT_MARKER, "keyword");

    let afterKey = false;
    const mayHaveKey = HAS_KEY.test(rest);
    while (this.pos < this.src.length) {
      if (this.eat(NEWLINE, "plain", false)) return;
      if (this.eat(SPACE, "plain", false)) continue;
      const ch = this.src[this.pos];
      if (ch === "#" && /\s/.test(this.src.charAt(this.pos - 1) || " ")) {
        this.lineComment();
        continue;
      }
      if (mayHaveKey && (!afterKey || this.flow > 0)) {
        const key = this.match(this.flow > 0 ? FLOW_KEY : KEY);
        if (key) {
          this.emit("property", key);
          this.pos += key.length;
          this.eat(SPACE, "plain", false);
          this.emit("punctuation", ":");
          this.pos++;
          afterKey = true;
          continue;
        }
      }
      if ((ch === "-" || ch === "?") && /^(?:[ \t\r\n]|$)/.test(this.src.charAt(this.pos + 1))) {
        this.emit("punctuation", ch);
        this.pos++;
        continue;
      }
      if (this.eat(ANCHOR, "variable") || this.eat(TAG, "type")) continue;
      if (this.eat(BLOCK_INDICATOR, "operator")) {
        this.block = indent.length;
        continue;
      }
      if (ch === '"') {
        this.lexDelimited({ open: '"', close: '"', multiline: true, escape: ESCAPE });
        continue;
      }
      if (ch === "'") {
        this.lexDelimited({ open: "'", close: "'", multiline: true, doubledClose: true });
        continue;
      }
      if (ch === "[" || ch === "{") {
        this.flow++;
        this.openBracket();
        continue;
      }
      if (ch === "]" || ch === "}") {
        if (this.flow > 0) this.flow--;
        this.closeBracket();
        continue;
      }
      if (ch === "," && this.flow > 0) {
        this.emit("punctuation", ch);
        this.pos++;
        continue;
      }
      this.scalar();
    }
  }

  /** A plain (unquoted) scalar: runs to a comment, the line end, or a flow delimiter. */
  private scalar(): void {
    const src = this.src;
    let end = this.pos;
    while (end < src.length) {
      const c = src[end];
      if (c === "\n" || c === "\r") break;
      if (c === "#" && (src[end - 1] === " " || src[end - 1] === "\t")) break;
      if (this.flow > 0 && (c === "," || c === "]" || c === "}")) break;
      end++;
    }
    end = Math.max(end, this.pos + 1);
    while (end > this.pos + 1 && (src[end - 1] === " " || src[end - 1] === "\t")) end--;
    const text = src.slice(this.pos, end);
    this.emit(NUMBER.test(text) ? "number" : CONSTANT.test(text) ? "constant" : "string", text);
    this.pos += text.length;
  }
}

const SIGNALS: Signal[] = [
  { weight: 4, pattern: /^(?:apiVersion|kind):[ \t]+\S/m },
  { weight: 2, pattern: /^---[ \t]*$/m },
  { weight: 3, pattern: /^[a-z_][\w.-]*:[ \t]*\r?\n[ \t]+(?:-[ \t]+)?[a-z_][\w.-]*:/m },
  { weight: 2, pattern: /^[ \t]*-[ \t]+[a-z_][\w.-]*:[ \t]/m },
  // Two consecutive `key: value` lines (without the semicolons of CSS).
  { weight: 2, pattern: /^[ \t]*[a-z_][\w.-]*:[ \t]+[^\s{;][^;\n]*\r?\n[ \t]*[a-z_][\w.-]*:[ \t]+[^\s{;][^;\n]*$/m },
];

export const yaml: Language = {
  id: "yaml",
  name: "YAML",
  tokenize: (source) => new YamlLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `# CI pipeline
name: build
on:
  push:
    branches: [main, "release/*"]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: |
          npm ci
          npm test`,
};
