import { NEWLINE, Scanner } from "../scanner";
import { scoreSignals } from "../signals";
import type { Language } from "../types";

/** Fenced code blocks name a language; the registry supplies the lexer (it imports this module). */
export const fenceLanguages: { find?: (name: string) => Language | null } = {};

const INDENT = /[ \t]*/y;
const FENCE = /(`{3,}|~{3,})[ \t]*([\w+#.-]*)[^\r\n]*/y;
const HEADING = /#{1,6}(?=[ \t]|\r|\n|$)[^\r\n]*/y;
const RULE = /(?:[-*_][ \t]*){3,}(?=\r|\n|$)/y;
const QUOTE = />[ \t]?/y;
const LIST = /(?:[-*+]|\d{1,9}[.)])(?=[ \t])/y;
const TASK = /[ \t]*\[[ xX]\](?=[ \t])/y;
const CODE_SPAN = /(`{1,3})(?!`)[^\r\n]*?\1(?!`)/y;
const STRONG = /\*\*(?=\S)[^\r\n]*?\S\*\*|__(?=\S)[^\r\n]*?\S__/y;
const EMPHASIS = /\*(?=[^\s*])[^*\r\n]*?[^\s*]\*|\*[^\s*]\*|_(?=[^\s_])[^_\r\n]*?[^\s_]_(?!\w)|_[^\s_]_(?!\w)/y;
const STRIKE = /~~(?=\S)[^\r\n]*?\S~~/y;
const LINK = /(!?\[)([^\]\r\n[]{0,300})(\]\()([^)\s\r\n]{0,500}(?:[ \t]+"[^"\r\n]{0,200}")?)(\))/y;
const AUTOLINK = /<(?:https?|mailto):[^>\s]+>|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/y;
const ESCAPE = /\\[!-/:-@[-`{-~]/y;
const TEXT = /[^`*_~[!<\\h\r\n]+|[\s\S]/y;

class MarkdownLexer extends Scanner {
  protected step(): void {
    const indent = this.match(INDENT) ?? "";
    this.emit("plain", indent, false);
    this.pos += indent.length;
    if (this.eat(NEWLINE, "plain", false)) return;

    if (this.fence()) return;
    if (this.eat(HEADING, "heading")) return;
    if (this.eat(RULE, "punctuation")) return;
    while (this.eat(QUOTE, "comment")) this.eat(INDENT, "plain", false);
    if (this.eat(LIST, "punctuation")) this.eat(TASK, "keyword");
    this.inline();
  }

  /** A ``` or ~~~ block: its contents use the named language's lexer when there is one. */
  private fence(): boolean {
    FENCE.lastIndex = this.pos;
    const open = FENCE.exec(this.src);
    if (!open) return false;
    this.emit("punctuation", open[0]);
    this.pos += open[0].length;
    const newline = this.match(NEWLINE);
    if (!newline) return true;
    this.emit("plain", newline, false);
    this.pos += newline.length;

    const marker = open[1];
    const close = new RegExp(`^[ \\t]*${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`, "gm");
    close.lastIndex = this.pos;
    const found = close.exec(this.src);
    const body = this.src.slice(this.pos, found ? found.index : this.src.length);
    const language = fenceLanguages.find?.(open[2]) ?? null;
    if (language) this.embed(language.tokenize(body));
    else {
      this.emit("string", body);
      this.pos += body.length;
    }
    if (found) {
      this.emit("punctuation", found[0]);
      this.pos += found[0].length;
    }
    return true;
  }

  private inline(): void {
    const src = this.src;
    while (this.pos < src.length && src[this.pos] !== "\n" && src[this.pos] !== "\r") {
      const ch = src[this.pos];
      if (ch === "`" && this.eat(CODE_SPAN, "string")) continue;
      if (ch === "*" || ch === "_") {
        const wordInside = ch === "_" && /\w/.test(src.charAt(this.pos - 1));
        if (!wordInside && (this.eat(STRONG, "strong") || this.eat(EMPHASIS, "emphasis"))) continue;
      }
      if (ch === "~" && this.eat(STRIKE, "comment")) continue;
      if (ch === "[" || ch === "!") {
        LINK.lastIndex = this.pos;
        const link = LINK.exec(src);
        if (link) {
          this.emit("punctuation", link[1]);
          this.emit("link", link[2]);
          this.emit("punctuation", link[3]);
          this.emit("string", link[4]);
          this.emit("punctuation", link[5]);
          this.pos += link[0].length;
          continue;
        }
      }
      if ((ch === "<" || ch === "h") && this.eat(AUTOLINK, "link")) continue;
      if (ch === "\\" && this.eat(ESCAPE, "escape")) continue;
      this.eat(TEXT, "plain");
    }
  }
}

export const markdown: Language = {
  id: "markdown",
  name: "Markdown",
  tokenize: (source) => new MarkdownLexer(source).run(),
  score: (source) =>
    scoreSignals(source, [
      { weight: 2, pattern: /^#{1,6}[ \t]+\S/m },
      { weight: 4, pattern: /^```[\w+#.-]*[ \t]*$/m },
      { weight: 3, pattern: /\[[^\]\n[]{1,200}\]\((?:https?:\/\/|\/|\.{0,2}\/?[\w-]+\.\w+)[^)\s]{0,500}\)/ },
      { weight: 2, pattern: /\*\*[^*\n]+\*\*/ },
      { weight: 1, pattern: /^[ \t]*(?:[-*+]|\d+\.)[ \t]+\S/m },
      { weight: 1, pattern: /`[^`\n]+`/ },
      { weight: 4, pattern: /^\|.*\|[ \t]*\r?\n\|?[ \t]*:?-{3,}/m },
      { weight: 2, pattern: /^[ \t]*[-*][ \t]+\[[ xX]\][ \t]/m },
    ]),
  sample: `# Release notes

## v1.3 — **31 languages**
- Highlight *any* cell with \`Home › Highlight\`
- [x] Batch, VBA and Dockerfile support
- See the [docs](https://example.com/docs) for details

\`\`\`bash
npm install code-highlighter
\`\`\``,
};
