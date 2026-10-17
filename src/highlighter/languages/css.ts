import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language } from "../types";

const AT_RULE = /@[\w-]+/y;
const PROPERTY = /--?[A-Za-z_][\w-]*|[A-Za-z_][\w-]*/y;
// A property name is followed by a colon and a value that reaches `;` or `}` before any `{`.
const IS_DECLARATION = /[ \t]*:(?!:)[^;{}]{0,500}(?:[;}]|$)/y;
const SELECTOR = /(?:::?|[.#])?-?[A-Za-z_][\w-]*|::?[\w-]+/y;
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:%|[A-Za-z]+)?/y;
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/y;
const FUNCTION = /-?[A-Za-z_][\w-]*(?=\()/y;
const IDENT = /-{0,2}[A-Za-z_][\w-]*/y;
const IMPORTANT = /![ \t]*important\b/iy;
const ESCAPE = /\\(?:[0-9a-fA-F]{1,6}[ \t]?|[^\r\n0-9a-fA-F])/uy;
const URL = /url\((?!\s*["'])[^)\r\n]*\)?/iy;

class CssLexer extends Scanner {
  private blocks = 0;
  /** Inside a block, before a declaration's colon. */
  private expectProperty = false;
  private inValue = false;
  private inAtRule = false;

  protected step(): void {
    const ch = this.src[this.pos];
    if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) return;
    if (this.at("/*")) return this.lexDelimited({ open: "/*", close: "*/", type: "comment", multiline: true });
    if (ch === '"' || ch === "'") return this.lexDelimited({ open: ch, close: ch, escape: ESCAPE });

    if (ch === "{") {
      this.openBracket();
      this.blocks++;
      this.expectProperty = true;
      this.inValue = this.inAtRule = false;
      return;
    }
    if (ch === "}") {
      this.closeBracket();
      if (this.blocks > 0) this.blocks--;
      this.expectProperty = this.blocks > 0;
      this.inValue = false;
      return;
    }
    if (ch === ";") {
      this.emit("punctuation", ch);
      this.pos++;
      this.inValue = this.inAtRule = false;
      this.expectProperty = this.blocks > 0;
      return;
    }
    if (this.eat(AT_RULE, "control")) {
      this.inAtRule = true;
      return;
    }

    if (this.inValue || this.inAtRule) return this.value();

    if (this.expectProperty) {
      const name = this.match(PROPERTY);
      IS_DECLARATION.lastIndex = this.pos + (name?.length ?? 0);
      if (name && IS_DECLARATION.test(this.src)) {
        this.emit("property", name);
        this.pos += name.length;
        this.eat(SPACE, "plain", false);
        this.emit("punctuation", ":");
        this.pos++;
        this.inValue = true;
        this.expectProperty = false;
        return;
      }
    }
    // Selectors: tags, .classes, #ids, :pseudo-classes and [attributes].
    if (this.eat(SELECTOR, "selector")) return;
    if (ch === "[" || ch === "(") return this.openBracket();
    if (ch === "]" || ch === ")") return this.closeBracket();
    if (ch === "," || ch === ":") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    if ("*>+~&|=^$".includes(ch)) {
      this.emit("operator", ch);
      this.pos++;
      return;
    }
    this.other();
  }

  /** Property values and at-rule preludes. */
  private value(): void {
    const ch = this.src[this.pos];
    if (this.eat(URL, "string") || this.eat(IMPORTANT, "keyword") || this.eat(HEX_COLOR, "number")) return;
    if (this.eat(FUNCTION, "function")) return;
    if (/[\d.+-]/.test(ch) && this.eat(NUMBER, "number")) return;
    if (this.inAtRule) {
      const name = this.match(PROPERTY);
      if (name) {
        this.emit(this.src.startsWith(":", this.pos + name.length) ? "property" : "keyword", name);
        this.pos += name.length;
        return;
      }
    }
    const ident = this.match(IDENT);
    if (ident) {
      this.emit(ident.startsWith("--") ? "variable" : "string", ident);
      this.pos += ident.length;
      return;
    }
    if (ch === "(" || ch === "[") return this.openBracket();
    if (ch === ")" || ch === "]") return this.closeBracket();
    if (ch === "," || ch === ":") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    if ("/*=<>".includes(ch)) {
      this.emit("operator", ch);
      this.pos++;
      return;
    }
    this.other();
  }
}

const SIGNALS: Signal[] = [
  // selector { property: value; }
  { weight: 4, pattern: /(?:^|\})[ \t]*[.#]?[A-Za-z*:&[][^{}();=\n]{0,200}\{\s*(?:--)?[a-z-]+\s*:\s*[^;{}"'=]{1,200};/m },
  { weight: 3, pattern: /@(?:media|import|keyframes|font-face|supports|layer|tailwind|apply)\b/ },
  { weight: 3, pattern: /^[ \t]*(?:color|margin|padding|display|font-size|font-family|background(?:-color)?|border(?:-radius)?|width|height|position|flex|grid-template-columns)\s*:\s*[^;\n'"]+;/m },
  { weight: 1, pattern: /#[0-9a-fA-F]{3,8}\b/ },
  { weight: 1, pattern: /\b\d+(?:px|rem|em|vh|vw)\b/ },
];

export const css: Language = {
  id: "css",
  name: "CSS",
  tokenize: (source) => new CssLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `/* Card component */
.card > .title:hover,
#main a[href^="https"] {
  color: #0f6cbd;
  margin: 0 auto 1.5rem;
  font: 600 14px/1.4 "Segoe UI", sans-serif;
  background: var(--surface, rgb(245 245 245 / 80%)) !important;
}
@media (max-width: 600px) {
  .card { padding: 8px; }
}`,
};
