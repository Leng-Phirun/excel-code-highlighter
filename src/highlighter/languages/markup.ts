import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language } from "../types";
import { javascript } from "./clike";
import { css } from "./css";

const TAG_NAME = /[A-Za-z_][\w:.-]*/y;
const ATTRIBUTE = /[^\s"'<>/=]+/y;
const UNQUOTED_VALUE = /[^\s"'<>=`]+/y;
const ENTITY = /&(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[xX][0-9a-fA-F]+);/y;
const TEXT = /[^<&]+/y;
const DOCTYPE = /<![A-Za-z][^>]*>?/y;

class MarkupLexer extends Scanner {
  protected step(): void {
    if (this.at("<!--")) return this.lexDelimited({ open: "<!--", close: "-->", type: "comment", multiline: true });
    if (this.at("<![CDATA[")) return this.lexDelimited({ open: "<![CDATA[", close: "]]>", multiline: true });
    if (this.eat(DOCTYPE, "keyword")) return;
    if (this.at("</") || this.at("<?") || (this.at("<") && /[A-Za-z_]/.test(this.src.charAt(this.pos + 1)))) {
      return this.tag();
    }
    if (this.eat(ENTITY, "escape") || this.eat(TEXT, "plain")) return;
    this.other();
  }

  private tag(): void {
    const open = this.at("</") || this.at("<?") ? this.src.slice(this.pos, this.pos + 2) : "<";
    this.emit("punctuation", open);
    this.pos += open.length;
    const name = this.eat(TAG_NAME, "tag") ?? "";

    while (this.pos < this.src.length) {
      if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) continue;
      const ch = this.src[this.pos];
      if (this.at("/>") || this.at("?>")) {
        this.emit("punctuation", this.src.slice(this.pos, this.pos + 2));
        this.pos += 2;
        return;
      }
      if (ch === ">") {
        this.emit("punctuation", ch);
        this.pos++;
        if (open === "<") this.rawContent(name.toLowerCase());
        return;
      }
      if (ch === "<") return; // unclosed tag
      if (ch === '"' || ch === "'") {
        this.lexDelimited({ open: ch, close: ch, multiline: true });
        continue;
      }
      if (ch === "=") {
        this.emit("operator", ch);
        this.pos++;
        this.eat(SPACE, "plain", false);
        this.eat(UNQUOTED_VALUE, "string");
        continue;
      }
      if (this.eat(ATTRIBUTE, "attribute")) continue;
      this.other();
    }
  }

  /** <script> and <style> hold code, not markup, up to their closing tag. */
  private rawContent(tag: string): void {
    const lexer = tag === "script" ? javascript : tag === "style" ? css : null;
    if (!lexer) return;
    const rest = this.src.slice(this.pos);
    const close = rest.search(new RegExp(`</${tag}\\s*>`, "i"));
    const code = close < 0 ? rest : rest.slice(0, close);
    this.embed(lexer.tokenize(code));
  }
}

const SIGNALS: Signal[] = [
  { weight: 6, pattern: /<!DOCTYPE\s+html/i },
  { weight: 6, pattern: /^[ \t]*<\?xml\s/ },
  { weight: 4, pattern: /<(?:html|head|body|div|span|p|a|ul|ol|li|table|tr|td|th|script|style|link|meta|img|br|form|input|button|section|nav|h[1-6])\b[^<>]*>/i },
  { weight: 2, pattern: /<\/[A-Za-z][\w:.-]*\s*>/ },
  { weight: 2, pattern: /<[A-Za-z][\w:.-]*(?:\s+[\w:-]+\s*=\s*"[^"]*")+\s*\/?>/ },
];

export const markup: Language = {
  id: "markup",
  name: "HTML / XML",
  tokenize: (source) => new MarkupLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `<!DOCTYPE html>
<!-- Sign-up form -->
<form id="signup" action="/api/join" method="post">
  <label for="email">Email &amp; updates</label>
  <input type="email" id="email" required>
  <button class="primary" disabled>Join</button>
</form>
<script>
  document.getElementById("signup").addEventListener("submit", (e) => e.preventDefault());
</script>`,
};
