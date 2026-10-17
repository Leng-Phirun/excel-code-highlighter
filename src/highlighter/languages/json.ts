import { NEWLINE, Scanner, SPACE } from "../scanner";
import type { Language } from "../types";

const KEY = /"(?:[^"\\\r\n]|\\.)*"(?=\s*:)/y;
const ESCAPE = /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/y;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WORD = /[A-Za-z_$][\w$]*/y;

/** JSON, also accepting the comments of JSONC. */
class JsonLexer extends Scanner {
  protected step(): void {
    const ch = this.src[this.pos];
    if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) return;
    if (this.at("//")) return this.lineComment();
    if (this.at("/*")) return this.lexDelimited({ open: "/*", close: "*/", type: "comment", multiline: true });
    if (this.eat(KEY, "property")) return;
    if (ch === '"') return this.lexDelimited({ open: '"', close: '"', escape: ESCAPE });
    if (this.eat(NUMBER, "number")) return;
    const word = this.match(WORD);
    if (word) {
      this.emit(word === "true" || word === "false" || word === "null" ? "constant" : "plain", word);
      this.pos += word.length;
      return;
    }
    if (ch === "{" || ch === "[") return this.openBracket();
    if (ch === "}" || ch === "]") return this.closeBracket();
    if (ch === ":" || ch === ",") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    this.other();
  }
}

export const json: Language = {
  id: "json",
  name: "JSON",
  tokenize: (source) => new JsonLexer(source).run(),
  score: (source) => {
    const text = source.trim();
    if (!/^[[{]/.test(text)) return 0;
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === "object" && value !== null ? 8 : 0;
    } catch {
      return /^\{\s*"[^"\n]+"\s*:/.test(text) ? 3 : 0;
    }
  },
  sample: `{
  "name": "code-highlighter",
  "version": "1.2.0",
  "private": true,
  "languages": ["python", "bash", "sql"],
  "limits": { "maxCells": 50000, "ratio": 0.56, "fallback": null }
}`,
};
