import type { Token, TokenType } from "./types";

export const BRACKETS: TokenType[] = ["bracket0", "bracket1", "bracket2"];

/** Unicode identifier pieces shared by most languages. */
export const ID_START = "[\\p{L}\\p{Nl}_]";
export const ID_CONT = "[\\p{L}\\p{Nl}\\p{Mn}\\p{Mc}\\p{Nd}\\p{Pc}]";

/** Deepest interpolation nesting a lexer follows; real code rarely goes past three. */
const MAX_NESTING = 40;

export const NEWLINE = /\r\n|\r|\n/y;
export const SPACE = /[ \t\f\v]+/y;

/** A quoted literal or comment with a known closing delimiter. */
export interface Delimited {
  /** Text at the current position that opens the literal (prefix included). */
  open: string;
  close: string;
  type?: TokenType;
  multiline?: boolean;
  /** Sticky pattern for escape sequences, tried wherever `escapeChar` appears. */
  escape?: RegExp;
  escapeChar?: string;
  /** A doubled closer stands for one literal closer, as in SQL's 'it''s'. */
  doubledClose?: boolean;
  /** Extra characters where `inner` gets a chance to run. */
  stops?: string;
  /** Handles interpolation at the current position; returns true if it consumed input. */
  inner?: () => boolean;
}

/**
 * Base for the hand-written lexers. Subclasses implement step(), which must
 * consume input; run() guarantees progress and the exact-text invariant.
 */
export abstract class Scanner {
  protected readonly src: string;
  protected readonly tokens: Token[] = [];
  protected pos = 0;
  /** The last token that was not whitespace or a comment. */
  protected prev: Token | null = null;
  /** Bracket nesting, for rainbow brackets. */
  protected depth = 0;
  /** Interpolation nesting (strings inside code inside strings ...), which input can make arbitrarily deep. */
  private nesting = 0;

  constructor(src: string) {
    this.src = src;
  }

  /** Lexes from `this.pos`, consuming at least one character when it can. */
  protected abstract step(): void;

  run(): Token[] {
    while (this.pos < this.src.length) {
      const before = this.pos;
      this.step();
      if (this.pos === before) this.other();
    }
    return this.tokens;
  }

  /**
   * Runs `lex` one interpolation level deeper, or returns false without
   * running it once MAX_NESTING levels are open, so that pathological input
   * like f'{f'{f'{… is treated as plain string text instead of overflowing the stack.
   */
  protected nested(lex: () => void): boolean {
    if (this.nesting >= MAX_NESTING) return false;
    this.nesting++;
    try {
      lex();
    } finally {
      this.nesting--;
    }
    return true;
  }

  protected emit(type: TokenType, text: string, significant = true): void {
    if (!text) return;
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else this.tokens.push({ type, text });
    if (significant) this.prev = { type, text };
  }

  /** Appends tokens produced by another lexer (embedded languages). */
  protected embed(tokens: Token[]): void {
    for (const token of tokens) {
      const text = token.text;
      this.emit(token.type, text, token.type !== "comment" && text.trim() !== "");
      this.pos += text.length;
    }
  }

  protected match(re: RegExp): string | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.src);
    return m ? m[0] : null;
  }

  /** Emits the match of sticky `re` at the current position as `type`. */
  protected eat(re: RegExp, type: TokenType, significant = true): string | null {
    const m = this.match(re);
    if (m) {
      this.emit(type, m, significant);
      this.pos += m.length;
    }
    return m;
  }

  protected at(text: string): boolean {
    return this.src.startsWith(text, this.pos);
  }

  /** Text from `from` to the end of its line, or only its first `max` characters. */
  protected restOfLine(from = this.pos, max = Infinity): string {
    const limit = Math.min(this.src.length, from + max);
    let end = from;
    while (end < limit && this.src[end] !== "\n" && this.src[end] !== "\r") end++;
    return this.src.slice(from, end);
  }

  /** True when only spaces or tabs separate the current position from the line start. */
  protected atLineStart(): boolean {
    for (let i = this.pos - 1; i >= 0; i--) {
      const ch = this.src[i];
      if (ch === "\n" || ch === "\r") return true;
      if (ch !== " " && ch !== "\t") return false;
    }
    return true;
  }

  /** Emits one code point as plain text. */
  protected other(type: TokenType = "plain"): void {
    const text = String.fromCodePoint(this.src.codePointAt(this.pos) as number);
    this.emit(type, text);
    this.pos += text.length;
  }

  protected openBracket(): void {
    this.emit(BRACKETS[this.depth % 3], this.src[this.pos]);
    this.depth++;
    this.pos++;
  }

  protected closeBracket(): void {
    if (this.depth > 0) this.depth--;
    this.emit(BRACKETS[this.depth % 3], this.src[this.pos]);
    this.pos++;
  }

  /** Comments to the end of the line. */
  protected lineComment(): void {
    const text = this.restOfLine();
    this.emit("comment", text, false);
    this.pos += text.length;
  }

  protected lexDelimited(o: Delimited): void {
    const src = this.src;
    const type = o.type ?? "string";
    const escapeChar = o.escapeChar ?? "\\";
    const stops = escapeChar + o.close[0] + "\r\n" + (o.stops ?? "");
    this.emit(type, o.open, type !== "comment");
    this.pos += o.open.length;

    while (this.pos < src.length) {
      if (o.doubledClose && src.startsWith(o.close + o.close, this.pos)) {
        this.emit(o.escape ? "escape" : type, o.close + o.close);
        this.pos += 2 * o.close.length;
        continue;
      }
      if (src.startsWith(o.close, this.pos)) {
        this.emit(type, o.close, type !== "comment");
        this.pos += o.close.length;
        return;
      }
      const ch = src[this.pos];
      if (!o.multiline && (ch === "\n" || ch === "\r")) return; // unterminated
      // Interpolation first: Swift's \( starts with the escape character.
      if (o.inner && o.inner()) continue;
      if (o.escape && ch === escapeChar) {
        const m = this.match(o.escape);
        if (m) {
          this.emit("escape", m);
          this.pos += m.length;
          continue;
        }
        // An unknown escape still shields the next character from closing the literal.
        let take = 1;
        if (this.pos + 1 < src.length) take = src[this.pos + 1] === "\r" && src[this.pos + 2] === "\n" ? 3 : 2;
        this.emit(type, src.slice(this.pos, this.pos + take));
        this.pos += take;
        continue;
      }

      let end = this.pos + 1;
      while (end < src.length && !stops.includes(src[end])) end++;
      this.emit(type, src.slice(this.pos, end), type !== "comment");
      this.pos = end;
    }
  }
}
