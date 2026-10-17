import { ID_CONT, ID_START, NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language, TokenType } from "../types";

const CONTROL = new Set([
  "if", "elif", "else", "for", "while", "break", "continue", "return", "try", "except",
  "finally", "raise", "with", "yield", "await", "import", "from", "as", "pass", "assert", "del",
]);
const STORAGE = new Set(["def", "class", "lambda", "async"]);
const KEYWORD = new Set(["and", "or", "not", "in", "is", "global", "nonlocal"]);
const CONSTANT = new Set(["True", "False", "None", "NotImplemented", "Ellipsis", "__debug__"]);
const SELF = new Set(["self", "cls"]);
const BUILTIN_FUNCS = new Set([
  "abs", "aiter", "all", "anext", "any", "ascii", "bin", "breakpoint", "callable", "chr",
  "classmethod", "compile", "delattr", "dir", "divmod", "enumerate", "eval", "exec", "filter",
  "format", "getattr", "globals", "hasattr", "hash", "help", "hex", "id", "input", "isinstance",
  "issubclass", "iter", "len", "locals", "map", "max", "min", "next", "oct", "open", "ord", "pow",
  "print", "property", "repr", "reversed", "round", "setattr", "sorted", "staticmethod", "sum",
  "super", "vars", "zip", "__import__",
]);
const BUILTIN_TYPES = new Set([
  "bool", "bytearray", "bytes", "complex", "dict", "float", "frozenset", "int", "list",
  "memoryview", "object", "range", "set", "slice", "str", "tuple", "type",
  "ArithmeticError", "AssertionError", "AttributeError", "BaseException", "BaseExceptionGroup",
  "BlockingIOError", "BrokenPipeError", "BufferError", "BytesWarning", "ChildProcessError",
  "ConnectionAbortedError", "ConnectionError", "ConnectionRefusedError", "ConnectionResetError",
  "DeprecationWarning", "EncodingWarning", "EnvironmentError", "EOFError", "Exception",
  "ExceptionGroup", "FileExistsError", "FileNotFoundError", "FloatingPointError", "FutureWarning",
  "GeneratorExit", "ImportError", "ImportWarning", "IndentationError", "IndexError",
  "InterruptedError", "IOError", "IsADirectoryError", "KeyboardInterrupt", "KeyError",
  "LookupError", "MemoryError", "ModuleNotFoundError", "NameError", "NotADirectoryError",
  "NotImplementedError", "OSError", "OverflowError", "PendingDeprecationWarning",
  "PermissionError", "ProcessLookupError", "PythonFinalizationError", "RecursionError",
  "ReferenceError", "ResourceWarning", "RuntimeError", "RuntimeWarning", "StopAsyncIteration",
  "StopIteration", "SyntaxError", "SyntaxWarning", "SystemError", "SystemExit", "TabError",
  "TimeoutError", "TypeError", "UnboundLocalError", "UnicodeDecodeError", "UnicodeEncodeError",
  "UnicodeError", "UnicodeTranslateError", "UnicodeWarning", "UserWarning", "ValueError",
  "Warning", "ZeroDivisionError",
]);
// Every legal string prefix, lower-cased (t-strings are Python 3.14+).
const STRING_PREFIXES = new Set(["r", "u", "f", "b", "t", "fr", "rf", "br", "rb", "tr", "rt"]);

const IDENT = new RegExp(`${ID_START}${ID_CONT}*`, "uy");
const DECORATOR = new RegExp(
  `@[ \\t]*${ID_START}${ID_CONT}*(?:[ \\t]*\\.[ \\t]*${ID_START}${ID_CONT}*)*`,
  "uy"
);
const TYPE_ALIAS = new RegExp(`^[ \\t]+${ID_START}${ID_CONT}*[ \\t]*(?:\\[[^\\]]*\\])?[ \\t]*=(?!=)`, "u");
const NUMBER =
  /0[xX](?:_?[0-9a-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?/y;
const OPERATOR = /\*\*=|\/\/=|>>=|<<=|->|:=|\*\*|\/\/|<<|>>|<=|>=|==|!=|[-+*/%@&|^]=|[-+*/%@&|^~<>=!]/y;
const CONTINUATION = /\\(?:\r\n|\r|\n)/y;
const CALL = /[ \t]*\(/y;
const STR_ESCAPE =
  /\\(?:\r\n|\r|\n|[\\'"abfnrtv]|[0-7]{1,3}|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|N\{[^}\r\n]*\})/y;
const BYTES_ESCAPE = /\\(?:\r\n|\r|\n|[\\'"abfnrtv]|[0-7]{1,3}|x[0-9a-fA-F]{2})/y;
const CONVERSION = /![A-Za-z]?/y;

/** Where an f-string replacement field must stop: the enclosing string's closing quote. */
interface FString {
  delim: string;
  triple: boolean;
}

class PythonLexer extends Scanner {
  /** True while only whitespace has been seen on the current logical line. */
  private lineStart = true;

  protected step(): void {
    this.lexCode(null);
  }

  /**
   * Lexes ordinary code. With `f`, lexes the expression part of an f-string
   * replacement field and returns before its closing `}`, `!conversion`,
   * `:format-spec` or the enclosing string's closing quote.
   */
  private lexCode(f: FString | null): void {
    const src = this.src;
    let localDepth = 0;
    while (this.pos < src.length) {
      const ch = src[this.pos];
      if (f) {
        if (src.startsWith(f.delim, this.pos)) return;
        if (!f.triple && (ch === "\n" || ch === "\r")) return;
        if (localDepth === 0 && (ch === "}" || ch === ":" || (ch === "!" && src[this.pos + 1] !== "="))) {
          return;
        }
      }

      let m = this.match(NEWLINE);
      if (m) {
        this.emit("plain", m, false);
        this.pos += m.length;
        if (this.depth === 0) this.lineStart = true;
        continue;
      }
      m = this.match(SPACE) ?? this.match(CONTINUATION);
      if (m) {
        this.emit("plain", m, false);
        this.pos += m.length;
        continue;
      }
      if (ch === "#" && !f) {
        this.lineComment();
        continue;
      }

      const atStart = this.lineStart;
      this.lineStart = false;

      if (ch === '"' || ch === "'") {
        this.lexString("");
        continue;
      }
      if (ch === "@" && atStart && !f && this.eat(DECORATOR, "decorator")) continue;

      m = this.match(IDENT);
      if (m) {
        const after = src[this.pos + m.length];
        if ((after === '"' || after === "'") && STRING_PREFIXES.has(m.toLowerCase())) {
          this.lexString(m);
          continue;
        }
        this.pos += m.length;
        this.emit(this.classify(m, atStart), m);
        continue;
      }

      if (this.eat(NUMBER, "number")) continue;
      if (src.startsWith("...", this.pos)) {
        this.emit("constant", "...");
        this.pos += 3;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        this.openBracket();
        localDepth++;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        if (localDepth > 0) localDepth--;
        this.closeBracket();
        continue;
      }
      if (this.eat(OPERATOR, "operator")) continue;
      if (ch === "," || ch === "." || ch === ":" || ch === ";") {
        this.emit("punctuation", ch);
        this.pos++;
        if (ch === ";" && this.depth === 0) this.lineStart = true;
        continue;
      }
      this.other();
    }
  }

  /** Classifies the identifier that ends at `this.pos`. */
  private classify(name: string, atStart: boolean): TokenType {
    if (CONTROL.has(name)) return "control";
    if (STORAGE.has(name)) return "storage";
    if (KEYWORD.has(name)) return "keyword";
    if (CONSTANT.has(name)) return "constant";

    const prev = this.prev;
    if (prev && prev.type === "storage" && prev.text === "def") return "function";
    if (prev && prev.type === "storage" && prev.text === "class") return "class";

    CALL.lastIndex = this.pos;
    const call = CALL.test(this.src);
    const capWord = /^_*[A-Z]/.test(name) && /[a-z]/.test(name);
    if (prev && prev.type === "punctuation" && prev.text === ".") {
      if (!call) return "variable";
      return capWord ? "class" : "function";
    }
    if (atStart) {
      const soft = this.softKeyword(name);
      if (soft) return soft;
    }
    if (SELF.has(name)) return "self";
    if (BUILTIN_TYPES.has(name)) return "type";
    if (BUILTIN_FUNCS.has(name)) return "builtin";
    if (call) return capWord ? "class" : "function";
    if (/^_*[A-Z][A-Z0-9_]+$/.test(name)) return "constantVar";
    return "variable";
  }

  /** `match`, `case` and `type` are keywords only in statement position. */
  private softKeyword(name: string): TokenType | null {
    if (name !== "match" && name !== "case" && name !== "type") return null;
    const rest = this.restOfLine(this.pos, 300);
    if (name === "match" || name === "case") {
      const next = rest.trimStart().charAt(0);
      if (!next || "=.,:;)]}".includes(next)) return null;
      return rest.includes(":") ? "control" : null;
    }
    if (name === "type" && TYPE_ALIAS.test(rest)) return "storage";
    return null;
  }

  /** Lexes a string literal starting at `this.pos` with the given prefix. */
  private lexString(prefix: string): void {
    const src = this.src;
    const quotePos = this.pos + prefix.length;
    const q = src[quotePos];
    const triple = src.startsWith(q + q + q, quotePos);
    const delim = triple ? q + q + q : q;
    const flags = prefix.toLowerCase();
    const isF = flags.includes("f") || flags.includes("t");
    const isRaw = flags.includes("r");
    const escape = flags.includes("b") ? BYTES_ESCAPE : STR_ESCAPE;

    this.emit("string", prefix + delim);
    this.pos = quotePos + delim.length;

    while (this.pos < src.length) {
      if (src.startsWith(delim, this.pos)) {
        this.emit("string", delim);
        this.pos += delim.length;
        return;
      }
      const ch = src[this.pos];
      if (!triple && (ch === "\n" || ch === "\r")) return; // unterminated

      if (ch === "\\") {
        if (!isRaw && this.eat(escape, "escape")) continue;
        // A backslash always shields the next character from ending the
        // string, even in raw strings; it never shields an f-string brace.
        let take = 1;
        const next = src[this.pos + 1];
        if (next !== undefined && !(isF && (next === "{" || next === "}"))) {
          take = next === "\r" && src[this.pos + 2] === "\n" ? 3 : 2;
        }
        this.emit("string", src.slice(this.pos, this.pos + take));
        this.pos += take;
        continue;
      }

      if (isF && (ch === "{" || ch === "}")) {
        if (src[this.pos + 1] === ch) {
          this.emit("escape", ch + ch);
          this.pos += 2;
        } else if (ch === "{") {
          this.lexReplacementField({ delim, triple });
        } else {
          this.emit("string", ch); // stray "}"
          this.pos++;
        }
        continue;
      }

      let end = this.pos + 1;
      while (end < src.length) {
        const c = src[end];
        if (c === "\\" || c === q || c === "\n" || c === "\r" || (isF && (c === "{" || c === "}"))) break;
        end++;
      }
      this.emit("string", src.slice(this.pos, end));
      this.pos = end;
    }
  }

  /** Lexes `{expr!r:spec}` inside an f-string, starting at its `{`. */
  private lexReplacementField(f: FString): void {
    const src = this.src;
    this.emit("interpolation", "{");
    this.pos++;
    if (!this.nested(() => this.lexCode(f))) return; // too deep: the rest stays string text
    if (src[this.pos] === "!") this.eat(CONVERSION, "interpolation");
    if (src[this.pos] === ":") {
      this.emit("interpolation", ":");
      this.pos++;
      this.lexFormatSpec(f);
    }
    if (src[this.pos] === "}") {
      this.emit("interpolation", "}");
      this.pos++;
    }
  }

  private lexFormatSpec(f: FString): void {
    const src = this.src;
    while (this.pos < src.length) {
      if (src.startsWith(f.delim, this.pos)) return;
      const ch = src[this.pos];
      if (ch === "}") return;
      if (!f.triple && (ch === "\n" || ch === "\r")) return;
      if (ch === "{") {
        this.lexReplacementField(f); // nested field, e.g. f"{x:{width}}"
        continue;
      }
      this.emit("interpolation", ch);
      this.pos++;
    }
  }
}

const SIGNALS: Signal[] = [
  // Unmistakable statements.
  { weight: 3, pattern: /^[ \t]*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(.*\)\s*(?:->\s*[^:]+)?:[ \t]*(?:#.*)?$/m },
  { weight: 3, pattern: /^[ \t]*class\s+[A-Za-z_]\w*[ \t]*(?:\([^)\n]*\)[ \t]*:|:[ \t]*(?:#.*)?\r?\n[ \t]+\S)/m },
  { weight: 3, pattern: /^[ \t]*from\s+\.*[A-Za-z_][\w.]*\s+import\s+(?:\*|\(|[A-Za-z_])/m },
  { weight: 3, pattern: /^[ \t]*import\s+[A-Za-z_][\w.]*(?:\s+as\s+[A-Za-z_]\w*)?(?:\s*,\s*[A-Za-z_][\w.]*)*[ \t]*(?:#.*)?$/m },
  { weight: 3, pattern: /^[ \t]*@[A-Za-z_][\w.]*(?:\(.*\))?[ \t]*\r?\n[ \t]*(?:@|def |class |async def )/m },
  { weight: 3, pattern: /^[ \t]*if\s+__name__\s*==\s*["']__main__["']\s*:/m },
  { weight: 3, pattern: /^[ \t]*(?:>>>|In \[\d+\]:)\s/m },
  // Strong hints.
  { weight: 2, pattern: /\bprint\s*\(/ },
  { weight: 2, pattern: /\bself\.[A-Za-z_]\w*/ },
  { weight: 2, pattern: /^[ \t]*(?:elif\s+.+|else|try|finally)\s*:[ \t]*(?:#.*)?$/m },
  { weight: 2, pattern: /^[ \t]*except\b[^:\n]*:[ \t]*(?:#.*)?$/m },
  { weight: 2, pattern: /^[ \t]*for\s+[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s+in\s+\S.*:[ \t]*(?:#.*)?$/m },
  { weight: 2, pattern: /^[ \t]*with\s+.+\s+as\s+[A-Za-z_]\w*\s*:[ \t]*(?:#.*)?$/m },
  { weight: 2, pattern: /\b(?:len|range|enumerate|isinstance|zip|sorted)\s*\(/ },
  // Weak hints: common in code, occasionally seen in prose.
  { weight: 1, pattern: /^[ \t]*(?:if|while)\s+.+:[ \t]*(?:#.*)?$/m },
  { weight: 1, pattern: /^[ \t]*return\b/m },
  { weight: 1, pattern: /^[ \t]*[A-Za-z_][\w.]*(?:\[[^\]\n]*\])?\s+(?:[-+*/%@&|^]|\/\/|\*\*)?=\s+[^=\s]/m },
  { weight: 1, pattern: /\b[A-Za-z_]\w*\.[A-Za-z_]\w*\(/ },
  { weight: 1, pattern: /\b[A-Za-z_]\w*\([^()\n]*\)/ },
  { weight: 1, pattern: /\b(?:True|False|None)\b/ },
  { weight: 1, pattern: /\blambda\b[^:\n]*:/ },
  { weight: 1, pattern: /^[ \t]*#(?![![])/m },
  { weight: 1, pattern: /\n(?: {2,}|\t)\S/ },
  // Brace-and-semicolon syntax is evidence against Python.
  { weight: -3, pattern: /\)[ \t]*\{[ \t]*$|^[ \t]*\}[ \t]*(?:else|catch|finally)\b|;[ \t]*$/m },
];

export const python: Language = {
  id: "python",
  name: "Python",
  tokenize: (source) => new PythonLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `@dataclass
class Order:
    total: float = 0.0

def discount(order, pct=10):
    """Return the discounted total."""
    if pct > 50:  # sanity check
        raise ValueError(f"bad pct: {pct!r}")
    return round(order.total * (1 - pct / 100), 2)`,
};
