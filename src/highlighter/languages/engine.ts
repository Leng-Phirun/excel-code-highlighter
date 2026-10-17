import { NEWLINE, Scanner, SPACE } from "../scanner";
import type { Language, TokenType } from "../types";

/*
 * One configurable lexer for the many languages built from the same parts:
 * identifiers, numbers, brackets, operators, comments and quoted strings.
 * Each language supplies its word lists and switches on the syntax it has.
 */

export interface Interpolation {
  /** Quote characters whose strings interpolate. */
  quotes: string;
  /** Opens an embedded expression: "${", "\\(" (Swift), "#{" (Ruby). */
  open?: string;
  close?: string;
  /** Bare `$name` variables inside strings (Kotlin, Dart, PHP, Scala). */
  variables?: boolean;
}

export interface Features {
  lineComments: string[];
  blockComments: [string, string][];
  preprocessor: boolean; // #include, #define, #if at line start
  annotations: boolean; // @Decorator
  regex: boolean; // /pattern/flags
  backtickStrings: boolean; // `text` (JS templates, Ruby commands)
  rawBackticks: boolean; // Go `raw`
  singleQuoteStrings: boolean; // 'text' is a string, not a char
  multilineStrings: boolean; // quoted strings may span lines (Rust, PHP, Ruby, R)
  charLiterals: boolean; // 'a'
  tripleQuotes: string[]; // """multi-line"""
  interpolation: Interpolation | null;
  csharpStrings: boolean; // @"verbatim", $"interpolated {x}"
  rust: boolean; // r#"raw"#, b"bytes", 'lifetimes, macros!, #[attributes]
  cppRaw: boolean; // R"(raw)"
  cPrefixes: boolean; // u8"", L"", u'', U''
  sigils: RegExp | null; // $var (PHP), @ivar / $global (Ruby)
  symbols: boolean; // Ruby :symbol and `key:` hash keys
  predicateNames: boolean; // Ruby empty? save!
  dottedNames: boolean; // R data.frame
  percentOperators: boolean; // R %>% %in%
  luaLongBrackets: boolean; // [[long string]], --[[long comment]]
  colonMethods: boolean; // Lua obj:method()
  rubyBlockComments: boolean; // =begin ... =end
  phpTags: boolean; // <?php ?>
  heredocs: boolean; // <<EOT (HCL, Ruby), <<<EOT (PHP)
  assignmentKeys: boolean; // HCL: a name before `=` is an attribute
  capitalizedTypes: boolean; // PascalCase names are types
  pascalMethods: boolean; // PascalCase calls are still methods (C#, Go)
  dollarIdentifiers: boolean; // $ in names (JS)
}

export interface Spec {
  id: string;
  name: string;
  sample: string;
  control: string;
  keyword?: string;
  storage: string;
  types?: string;
  constants: string;
  self?: string;
  builtins?: string;
  /** Words followed by a function name. */
  functionDecl?: string;
  /** Words followed by a type name. */
  typeDecl?: string;
  features: Partial<Features>;
  score: (source: string) => number;
}

interface Compiled {
  control: Set<string>;
  keyword: Set<string>;
  storage: Set<string>;
  types: Set<string>;
  constants: Set<string>;
  self: Set<string>;
  builtins: Set<string>;
  functionDecl: Set<string>;
  typeDecl: Set<string>;
  f: Features;
}

export const words = (list = ""): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

const ESCAPE =
  /\\(?:[\\'"?abfnrtv0`$]|x[0-9a-fA-F]{1,4}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|\r?\n)/y;
const NUMBER =
  /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.(?![.A-Za-z_])[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)(?:[A-Za-z_]\w*)?/y;
const IDENT = /[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/uy;
const IDENT_DOLLAR = /[\p{L}\p{Nl}_$][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}$]*/uy;
const IDENT_DOTTED = /(?:[\p{L}_]|\.(?![\d.]))[\p{L}\p{Nd}_.]*/uy;
const DIRECTIVE = /#[ \t]*[A-Za-z_]\w*/y;
const INCLUDE_PATH = /<[^>\r\n]*>/y;
const ANNOTATION = /@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/y;
const RUST_ATTRIBUTE = /#!?\[[^\]\r\n]*\]?/y;
const RUST_RAW = /b?r(#*)"/y;
const RUST_BYTES = /b(?=["'])/y;
const RUST_MACROS = words(
  "println print eprintln eprint format vec panic assert assert_eq assert_ne debug_assert write writeln todo unimplemented unreachable matches include_str env concat dbg"
);
const CPP_RAW = /(?:u8|[uUL])?R"([^()\\\s]{0,16})\(/y;
const C_PREFIX = /(?:u8|[uUL])(?=["'])/y;
const CSHARP_PREFIX = /\$@"|@\$"|\$"|@"/y;
const CHAR = /'(?:\\(?:x[0-9a-fA-F]+|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[^\r\n])|[^'\\\r\n])'/y;
const LIFETIME = /'[A-Za-z_]\w*/y;
const REGEX = /\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\r\n]){0,100}\]|[^/\\\r\n[]){1,200}\/[dgimsuyv]*/y;
const OPERATOR =
  /\.\.\.|\.\.=?|>>>=|\?\?=|\*\*=|<<=|>>=|>>>|===|!==|<=>|\?\?|\?\.(?!\d)|\*\*|=>|->|::|\+\+|--|&&=?|\|\|=?|<<|>>|<=|>=|==|!=|[-+*/%&|^~!<>=?:@#]/y;
const CALL = /[ \t]*\(/y;
const FORMAT_SPEC = /[:,][^}\r\n"]*/y;
const STRING_VARIABLE = /\$[A-Za-z_]\w*/y;
const RUBY_SYMBOL = /:[A-Za-z_]\w*[?!=]?/y;
const PERCENT_OPERATOR = /%[^%\s]*%/y;
const LUA_LONG_COMMENT = /--\[(=*)\[/y;
const LUA_LONG_STRING = /\[(=*)\[/y;
const PHP_TAG = /<\?(?:php|=)?|\?>/y;
const HEREDOC = /<<<?[-~]?[ \t]*(["']?)([A-Za-z_]\w*)\1/y;
const ASSIGNS = /[ \t]*=(?![=>])/y;

class EngineLexer extends Scanner {
  private readonly lang: Compiled;
  private lineStart = true;
  private heredocs: string[] = [];

  constructor(src: string, lang: Compiled) {
    super(src);
    this.lang = lang;
  }

  protected step(): void {
    this.code(null);
  }

  /** Lexes code; with `stops`, returns before any of those characters at nesting depth 0. */
  private code(stops: string | null): void {
    const src = this.src;
    const f = this.lang.f;
    let local = 0;
    while (this.pos < src.length) {
      const ch = src[this.pos];
      if (stops && local === 0 && stops.includes(ch)) return;

      const newline = this.match(NEWLINE);
      if (newline) {
        this.emit("plain", newline, false);
        this.pos += newline.length;
        this.lineStart = true;
        if (this.heredocs.length) this.heredocBodies();
        continue;
      }
      if (this.eat(SPACE, "plain", false)) continue;
      if (this.comment()) continue;
      if (ch === "#" && f.preprocessor && this.lineStart) {
        const directive = this.eat(DIRECTIVE, "control");
        if (directive) {
          if (/include|import/.test(directive)) {
            this.eat(SPACE, "plain", false);
            this.eat(INCLUDE_PATH, "string");
          }
          continue;
        }
      }
      this.lineStart = false;
      if (ch === "#" && f.rust && this.eat(RUST_ATTRIBUTE, "decorator")) continue;
      if (ch === "@" && f.annotations && this.eat(ANNOTATION, "decorator")) continue;
      if (f.phpTags && (ch === "<" || ch === "?") && this.eat(PHP_TAG, "keyword")) continue;
      if (this.literal()) continue;
      if (f.sigils) {
        const sigil = this.match(f.sigils);
        if (sigil) {
          this.emit(this.lang.self.has(sigil) ? "self" : "variable", sigil);
          this.pos += sigil.length;
          continue;
        }
      }
      if (ch === ":" && f.symbols && !/[\w:)\]]/.test(src.charAt(this.pos - 1)) && this.eat(RUBY_SYMBOL, "constant")) {
        continue;
      }

      const ident = this.match(f.dottedNames ? IDENT_DOTTED : f.dollarIdentifiers ? IDENT_DOLLAR : IDENT);
      if (ident) {
        this.identifier(ident);
        continue;
      }
      if (/[\d.]/.test(ch) && this.eat(NUMBER, "number")) continue;
      if (ch === "/" && f.regex && this.regexAllowed() && this.eat(REGEX, "regex")) continue;
      if (ch === "%" && f.percentOperators && this.eat(PERCENT_OPERATOR, "operator")) continue;

      if (ch === "(" || ch === "[" || ch === "{") {
        this.openBracket();
        local++;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        if (local > 0) local--;
        this.closeBracket();
        continue;
      }
      if (this.eat(OPERATOR, "operator")) continue;
      if (ch === "." || ch === "," || ch === ";") {
        this.emit("punctuation", ch);
        this.pos++;
        continue;
      }
      this.other();
    }
  }

  private comment(): boolean {
    const f = this.lang.f;
    if (f.luaLongBrackets) {
      LUA_LONG_COMMENT.lastIndex = this.pos;
      const long = LUA_LONG_COMMENT.exec(this.src);
      if (long) {
        this.lexDelimited({ open: long[0], close: `]${long[1]}]`, type: "comment", multiline: true });
        return true;
      }
    }
    if (f.rubyBlockComments && this.lineStart && this.at("=begin")) {
      this.lexDelimited({ open: "=begin", close: "=end", type: "comment", multiline: true });
      return true;
    }
    for (const [open, close] of f.blockComments) {
      if (this.at(open)) {
        this.lexDelimited({ open, close, type: "comment", multiline: true });
        return true;
      }
    }
    for (const prefix of f.lineComments) {
      if (this.at(prefix)) {
        this.lineComment();
        return true;
      }
    }
    return false;
  }

  private identifier(ident: string): void {
    const src = this.src;
    const f = this.lang.f;
    this.pos += ident.length;
    if (f.rust && src[this.pos] === "!" && "([{".includes(src.charAt(this.pos + 1))) {
      this.emit(RUST_MACROS.has(ident) ? "builtin" : "function", `${ident}!`);
      this.pos++;
      return;
    }
    let name = ident;
    if (f.predicateNames && /[?!]/.test(src.charAt(this.pos)) && src.charAt(this.pos + 1) !== "=") {
      name += src[this.pos];
      this.pos++;
    }
    this.emit(this.classify(name), name);
  }

  /** String, char and other literals; returns false if none starts here. */
  private literal(): boolean {
    const src = this.src;
    const f = this.lang.f;
    const ch = src[this.pos];

    if (f.heredocs && ch === "<" && this.heredoc()) return true;
    if (f.csharpStrings) {
      const prefix = this.match(CSHARP_PREFIX);
      if (prefix) {
        const verbatim = prefix.includes("@");
        const interpolated = prefix.includes("$");
        this.lexDelimited({
          open: prefix,
          close: '"',
          multiline: verbatim,
          doubledClose: verbatim,
          escape: verbatim ? undefined : ESCAPE,
          stops: interpolated ? "{}" : "",
          inner: interpolated ? () => this.csharpHole() : undefined,
        });
        return true;
      }
    }
    if (f.rust) {
      RUST_RAW.lastIndex = this.pos;
      const raw = RUST_RAW.exec(src);
      if (raw) {
        this.lexDelimited({ open: raw[0], close: `"${raw[1]}`, multiline: true });
        return true;
      }
      if (this.match(RUST_BYTES)) {
        if (src[this.pos + 1] === '"') {
          this.lexDelimited({ open: 'b"', close: '"', multiline: true, escape: ESCAPE });
          return true;
        }
        CHAR.lastIndex = this.pos + 1;
        const byte = CHAR.exec(src);
        if (byte) {
          this.emit("string", `b${byte[0]}`);
          this.pos += byte[0].length + 1;
          return true;
        }
      }
    }
    if (f.cppRaw) {
      CPP_RAW.lastIndex = this.pos;
      const raw = CPP_RAW.exec(src);
      if (raw) {
        this.lexDelimited({ open: raw[0], close: `)${raw[1]}"`, multiline: true });
        return true;
      }
    }
    if (f.luaLongBrackets && ch === "[") {
      LUA_LONG_STRING.lastIndex = this.pos;
      const long = LUA_LONG_STRING.exec(src);
      if (long) {
        this.lexDelimited({ open: long[0], close: `]${long[1]}]`, multiline: true });
        return true;
      }
    }
    for (const triple of f.tripleQuotes) {
      if (this.at(triple)) {
        this.quoted(triple, triple, true);
        return true;
      }
    }

    const prefix = f.cPrefixes ? this.match(C_PREFIX) ?? "" : "";
    const quote = src[this.pos + prefix.length];
    if (quote === '"') {
      this.quoted(`${prefix}"`, '"', f.rust || f.multilineStrings);
      return true;
    }
    if (quote === "'") {
      if (f.singleQuoteStrings) {
        this.quoted("'", "'", f.multilineStrings);
        return true;
      }
      CHAR.lastIndex = this.pos + prefix.length;
      const char = CHAR.exec(src);
      if (char && f.charLiterals) {
        this.emit("string", prefix + char[0]);
        this.pos += prefix.length + char[0].length;
        return true;
      }
      if (!prefix && f.rust && this.eat(LIFETIME, "storage")) return true;
      return false;
    }
    if (ch === "`" && f.backtickStrings) {
      this.quoted("`", "`", true);
      return true;
    }
    if (ch === "`" && f.rawBackticks) {
      this.lexDelimited({ open: "`", close: "`", multiline: true });
      return true;
    }
    return false;
  }

  /** A quoted string, with interpolation where the language has it for this quote. */
  private quoted(open: string, close: string, multiline: boolean): void {
    const it = this.lang.f.interpolation;
    const active = it && it.quotes.includes(close[0]) ? it : null;
    this.lexDelimited({
      open,
      close,
      multiline,
      escape: ESCAPE,
      stops: active ? (active.open?.[0] ?? "") + (active.variables ? "$" : "") : "",
      inner: active ? () => this.interpolate(active) : undefined,
    });
  }

  private interpolate(it: Interpolation): boolean {
    if (it.open && this.at(it.open)) {
      const close = it.close ?? "}";
      this.emit("interpolation", it.open);
      this.pos += it.open.length;
      this.nested(() => this.code(close));
      if (this.at(close)) {
        this.emit("interpolation", close);
        this.pos += close.length;
      }
      return true;
    }
    return !!(it.variables && this.src[this.pos] === "$" && this.eat(STRING_VARIABLE, "variable"));
  }

  /** `{{`, `}}` or a `{expr,align:format}` hole inside a C# interpolated string. */
  private csharpHole(): boolean {
    const ch = this.src[this.pos];
    if (ch !== "{" && ch !== "}") return false;
    if (this.src[this.pos + 1] === ch) {
      this.emit("escape", ch + ch);
      this.pos += 2;
      return true;
    }
    if (ch === "}") return false;
    this.emit("interpolation", "{");
    this.pos++;
    this.nested(() => this.code("}:,"));
    this.eat(FORMAT_SPEC, "interpolation");
    if (this.src[this.pos] === "}") {
      this.emit("interpolation", "}");
      this.pos++;
    }
    return true;
  }

  /** `<<EOT` / `<<<EOT`: the marker now, the body after the end of this line. */
  private heredoc(): boolean {
    HEREDOC.lastIndex = this.pos;
    const m = HEREDOC.exec(this.src);
    if (!m) return false;
    this.emit("string", m[0]);
    this.pos += m[0].length;
    this.heredocs.push(m[2]);
    return true;
  }

  private heredocBodies(): void {
    const src = this.src;
    while (this.heredocs.length) {
      const name = this.heredocs.shift() as string;
      const start = this.pos;
      let line = this.pos;
      for (;;) {
        const text = this.restOfLine(line);
        const indent = /^[ \t]*/.exec(text)?.[0].length ?? 0;
        if (text.startsWith(name, indent) && !/\w/.test(text.charAt(indent + name.length))) {
          this.emit("string", src.slice(start, line + indent + name.length));
          this.pos = line + indent + name.length;
          break;
        }
        let next = line + text.length;
        if (next >= src.length) {
          this.emit("string", src.slice(start)); // unterminated
          this.pos = src.length;
          return;
        }
        next += src[next] === "\r" && src[next + 1] === "\n" ? 2 : 1;
        line = next;
      }
    }
  }

  private regexAllowed(): boolean {
    const p = this.prev;
    if (!p) return true;
    const last = p.text.slice(-1);
    // After a postfix a++ or b--, a slash divides.
    if (p.type === "operator") return !/(?:\+\+|--)$/.test(p.text);
    if (p.type === "control" || p.type === "keyword") return true;
    if (p.type === "punctuation") return last !== ".";
    if (p.type.startsWith("bracket")) return "([{".includes(last);
    return false;
  }

  /** Classifies the identifier that ends at `this.pos`. */
  private classify(id: string): TokenType {
    const lang = this.lang;
    const f = lang.f;
    const prev = this.prev;
    CALL.lastIndex = this.pos;
    const call = CALL.test(this.src);
    const capWord = /^_*[A-Z]/.test(id) && /[a-z]/.test(id);
    const callType: TokenType = capWord && !f.pascalMethods ? "class" : "function";

    const member =
      prev &&
      (prev.text === "." || prev.text === "?." || prev.text === "->" || prev.text === "::" || (f.colonMethods && prev.text === ":"));
    if (member) {
      if (prev.text === "::" && lang.types.has(id)) return "type";
      if (prev.text === "::" && lang.builtins.has(id)) return "builtin";
      if (call) return callType;
      return capWord && f.capitalizedTypes ? "class" : "variable";
    }
    if (f.assignmentKeys) {
      ASSIGNS.lastIndex = this.pos;
      if (ASSIGNS.test(this.src)) return "property";
    }
    if (f.symbols && this.src[this.pos] === ":" && /^[ \t]/.test(this.src.charAt(this.pos + 1))) return "constant";
    if (lang.control.has(id)) return "control";
    if (lang.storage.has(id)) return "storage";
    if (lang.keyword.has(id)) return "keyword";
    if (lang.constants.has(id)) return "constant";
    if (lang.self.has(id)) return "self";
    if (prev && lang.functionDecl.has(prev.text)) return "function";
    if (prev && lang.typeDecl.has(prev.text)) return "class";
    if (lang.types.has(id)) return "type";
    if (lang.builtins.has(id)) return "builtin";
    if (prev && prev.text === "new") return "class";
    if (call) return callType;
    if (/^_*[A-Z][A-Z0-9_]+$/.test(id)) return "constantVar";
    if (capWord && f.capitalizedTypes) return "class";
    return "variable";
  }
}

const DEFAULTS: Features = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  preprocessor: false,
  annotations: false,
  regex: false,
  backtickStrings: false,
  rawBackticks: false,
  singleQuoteStrings: false,
  multilineStrings: false,
  charLiterals: false,
  tripleQuotes: [],
  interpolation: null,
  csharpStrings: false,
  rust: false,
  cppRaw: false,
  cPrefixes: false,
  sigils: null,
  symbols: false,
  predicateNames: false,
  dottedNames: false,
  percentOperators: false,
  luaLongBrackets: false,
  colonMethods: false,
  rubyBlockComments: false,
  phpTags: false,
  heredocs: false,
  assignmentKeys: false,
  capitalizedTypes: false,
  pascalMethods: false,
  dollarIdentifiers: false,
};

export function define(spec: Spec): Language {
  const compiled: Compiled = {
    control: words(spec.control),
    keyword: words(spec.keyword),
    storage: words(spec.storage),
    types: words(spec.types),
    constants: words(spec.constants),
    self: words(spec.self),
    builtins: words(spec.builtins),
    functionDecl: words(spec.functionDecl),
    typeDecl: words(spec.typeDecl),
    f: { ...DEFAULTS, ...spec.features },
  };
  return {
    id: spec.id,
    name: spec.name,
    sample: spec.sample,
    score: spec.score,
    tokenize: (source) => new EngineLexer(source, compiled).run(),
  };
}
