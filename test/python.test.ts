import { describe, expect, it } from "vitest";
import { python } from "../src/highlighter/languages/python";
import type { TokenType } from "../src/highlighter/types";

const tokenizePython = python.tokenize;

/** Non-blank tokens as [type, text] pairs. */
const lex = (src: string): [TokenType, string][] =>
  tokenizePython(src)
    .filter((t) => t.text.trim() !== "")
    .map((t) => [t.type, t.text]);

const typeOf = (src: string, text: string): TokenType | undefined => lex(src).find(([, t]) => t === text)?.[0];

const SAMPLES = [
  "",
  "x",
  "def f(a, b=2, *args, **kw) -> int:\n    return a + b  # sum\n",
  'print(f"{name!r:>{width}} = {value:.2f} {{literal}}")',
  "s = '''multi\nline \\n string'''\nb = rb'\\d+' + b'\\x00'",
  "@app.route('/x')\nasync def handler(req):\n    await req.json()",
  "match command.split():\n    case [\"go\", direction]:\n        pass\n    case _:\n        print('?')",
  "unterminated = 'abc\nnext = f\"{oops\n",
  "x = 1_000 + 0x_FF + 0b1010 + 0o17 + 3.14e-2j + .5",
  "λ = 'ünïcödé' # 中文 😀",
  "a = [1, (2, {3: 4})]\r\nb = a[0]\r\n",
  "if x:\\\n    pass",
  "f'{x:{y}.{z}}' f'{a[\"k\"]}' f\"\"\"{\n  b\n}\"\"\"",
  "rf'\\{x}' + fr\"\\d{y}\"",
  "}}}{{{ )))((( '\"\\",
];

describe("tokenizePython", () => {
  it("always reproduces its input exactly", () => {
    for (const src of SAMPLES) {
      expect(tokenizePython(src).map((t) => t.text).join("")).toBe(src);
    }
  });

  it("reproduces random input exactly", () => {
    const alphabet = "abcdefrbuFRB_019 \t\n\r\\'\"#@()[]{}:=!.,;+-*/%<>&|^~$?`λ😀";
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 3000; i++) {
      const len = Math.floor(rand() * 60);
      let src = "";
      for (let j = 0; j < len; j++) src += [...alphabet][Math.floor(rand() * [...alphabet].length)];
      expect(tokenizePython(src).map((t) => t.text).join("")).toBe(src);
    }
  });

  it("handles a large cell quickly", () => {
    const big = SAMPLES.join("\n").repeat(200);
    const start = Date.now();
    tokenizePython(big);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("classifies keywords, definitions and names", () => {
    expect(lex("def greet(self, name):\n    return name")).toEqual([
      ["storage", "def"],
      ["function", "greet"],
      ["bracket0", "("],
      ["self", "self"],
      ["punctuation", ","],
      ["variable", "name"],
      ["bracket0", ")"],
      ["punctuation", ":"],
      ["control", "return"],
      ["variable", "name"],
    ]);
    expect(typeOf("class Point(Base): pass", "Point")).toBe("class");
    expect(typeOf("x = not y and z is None", "not")).toBe("keyword");
    expect(typeOf("x = not y and z is None", "None")).toBe("constant");
    expect(typeOf("from os import path", "from")).toBe("control");
    expect(typeOf("MAX_SIZE = 10", "MAX_SIZE")).toBe("constantVar");
    expect(typeOf("x = ...", "...")).toBe("constant");
  });

  it("separates builtins, types, calls and attributes", () => {
    expect(typeOf("print(len(xs))", "print")).toBe("builtin");
    expect(typeOf("print(len(xs))", "len")).toBe("builtin");
    expect(typeOf("isinstance(x, str)", "str")).toBe("type");
    expect(typeOf("raise ValueError('x')", "ValueError")).toBe("type");
    expect(typeOf("result = compute(1)", "compute")).toBe("function");
    expect(typeOf("p = Path('a')", "Path")).toBe("class");
    expect(typeOf("df = pd.read_csv(f)", "read_csv")).toBe("function");
    expect(typeOf("df = pd.DataFrame(d)", "DataFrame")).toBe("class");
    expect(typeOf("n = obj.count", "count")).toBe("variable");
    expect(typeOf("obj.print()", "print")).toBe("function");
    expect(typeOf("def print(): pass", "print")).toBe("function");
  });

  it("lexes decorators only at the start of a statement", () => {
    expect(lex("@app.route('/')\ndef index(): pass")[0]).toEqual(["decorator", "@app.route"]);
    expect(typeOf("c = a @ b", "@")).toBe("operator");
  });

  it("lexes string prefixes, triple quotes and escapes", () => {
    expect(lex("x = 'it''s'")).toEqual([
      ["variable", "x"],
      ["operator", "="],
      ["string", "'it''s'"],
    ]);
    expect(lex('b"\\x00\\n"')).toEqual([
      ["string", 'b"'],
      ["escape", "\\x00\\n"],
      ["string", '"'],
    ]);
    expect(lex("r'\\n'")).toEqual([["string", "r'\\n'"]]);
    expect(lex('"""a\n"b"\nc"""')).toEqual([["string", '"""a\n"b"\nc"""']]);
    expect(lex("'a\\'b'")).toEqual([
      ["string", "'a"],
      ["escape", "\\'"],
      ["string", "b'"],
    ]);
    // An identifier that is not a prefix is not part of the string.
    expect(lex("x'a'")[0]).toEqual(["variable", "x"]);
  });

  it("stops an unterminated single-quoted string at the line end", () => {
    expect(lex("s = 'oops\nx = 1")).toEqual([
      ["variable", "s"],
      ["operator", "="],
      ["string", "'oops"],
      ["variable", "x"],
      ["operator", "="],
      ["number", "1"],
    ]);
  });

  it("highlights code inside f-string replacement fields", () => {
    expect(lex('f"Hi {user.name!r:>10} {{x}}"')).toEqual([
      ["string", 'f"Hi '],
      ["interpolation", "{"],
      ["variable", "user"],
      ["punctuation", "."],
      ["variable", "name"],
      ["interpolation", "!r:>10}"],
      ["escape", "{{"],
      ["string", "x"],
      ["escape", "}}"],
      ["string", '"'],
    ]);
    expect(lex("f'{d[\"k\"]:{w}}'")).toEqual([
      ["string", "f'"],
      ["interpolation", "{"],
      ["variable", "d"],
      ["bracket0", "["],
      ["string", '"k"'],
      ["bracket0", "]"],
      ["interpolation", ":{"],
      ["variable", "w"],
      ["interpolation", "}}"],
      ["string", "'"],
    ]);
    expect(typeOf("f'{a != b}'", "!=")).toBe("operator");
    expect(typeOf("f'{x=}'", "=")).toBe("operator");
  });

  it("lexes numbers", () => {
    for (const n of ["0", "42", "1_000", "0xFF", "0o17", "0b1010", "3.14", ".5", "1e-3", "2j", "1_0.0_1e+1_0J"]) {
      expect(lex(`x = ${n}`)[2]).toEqual(["number", n]);
    }
  });

  it("treats comments as comments", () => {
    expect(lex("x = 1  # set x\ny")).toContainEqual(["comment", "# set x"]);
    expect(lex("s = '# not a comment'")).toEqual([
      ["variable", "s"],
      ["operator", "="],
      ["string", "'# not a comment'"],
    ]);
  });

  it("colours brackets by nesting depth", () => {
    expect(lex("f(a[{1}])").map(([type]) => type)).toEqual([
      "function", "bracket0", "variable", "bracket1", "bracket2", "number", "bracket2", "bracket1", "bracket0",
    ]);
  });

  it("recognises soft keywords only in statement position", () => {
    expect(typeOf("match point:\n    case (0, 0): pass", "match")).toBe("control");
    expect(typeOf("match point:\n    case (0, 0): pass", "case")).toBe("control");
    expect(typeOf("match = re.match(p, s)", "match")).toBe("variable");
    expect(typeOf("m = re.match(p, s)", "match")).toBe("function");
    expect(typeOf("type Pair = tuple[int, int]", "type")).toBe("storage");
    expect(typeOf("t = type(x)", "type")).toBe("type");
  });
});
