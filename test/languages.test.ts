import { describe, expect, it } from "vitest";
import { getLanguage, LANGUAGES } from "../src/highlighter/languages";
import type { TokenType } from "../src/highlighter/types";

/** Non-blank tokens as [type, text] pairs; plain words lose the spaces merged into them. */
const lex = (id: string, src: string): [TokenType, string][] =>
  getLanguage(id)
    .tokenize(src)
    .filter((t) => t.text.trim() !== "")
    .map((t) => [t.type, t.type === "plain" ? t.text.trim() : t.text]);

const typeOf = (id: string, src: string, text: string): TokenType | undefined =>
  lex(id, src).find(([, t]) => t === text)?.[0];

// Fragments that open or close literals in some language, to stress every lexer.
const FRAGMENTS = [
  "a", "b", "r", "f", "x", "0", "1", " ", "\t", "\n", "\r\n", "\\", "'", '"', "`", "$", "#", "@",
  "<", ">", "/", "*", "{", "}", "[", "]", "(", ")", ";", ":", "-", "|", "&", "=", ".", ",", "!",
  "?", "%", "λ", "😀", "<<EOF", "EOF", "$(", "${", 'r#"', '"#', 'R"(', ')"', "<!--", "-->", "/*",
  "*/", '"""', "'''", "<script>", "</script>", "<style>", "|\n", "- ", "key: ", "--x", 'f"{', '}"',
  '@"', '$"', "<#", "#>", "@'", "'@", "$((", "))", "<a b=", "\n  ", "`${",
];

describe.each(LANGUAGES.map((l) => [l.id, l] as const))("%s", (_id, language) => {
  const join = (src: string) => language.tokenize(src).map((t) => t.text).join("");

  it("reproduces its sample and every other sample exactly", () => {
    for (const other of LANGUAGES) expect(join(other.sample)).toBe(other.sample);
  });

  it("reproduces random input exactly", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 1500; i++) {
      let src = "";
      const len = Math.floor(rand() * 40);
      for (let j = 0; j < len; j++) src += FRAGMENTS[Math.floor(rand() * FRAGMENTS.length)];
      expect(join(src)).toBe(src);
    }
  });

  it("handles a large cell quickly", () => {
    const big = LANGUAGES.map((l) => l.sample).join("\n").repeat(40);
    const start = Date.now();
    language.tokenize(big);
    expect(Date.now() - start).toBeLessThan(1500);
  });

  it("stays fast on adversarial 32,000-character cells", () => {
    const patterns = [
      '"', "'", "`", "{", "}", "(", "[", "\\", "#", "<", ">", "*", "_", "$", "@", "-", "/", "|", ":", "%", " ",
      "\n", "${", "#{", "[[", "/*", "<!--", "<<", "**", "a ", "_a", "a.", "x=", "--", "\\(", "{{", "f'{", "<a ",
      "- ", "# ", "``", "%%", "!x", "a\\\n",
      // Deep nesting once overflowed the stack (review finding).
      "$(", "`${", '$"{', '"$(', "f\"{f'{", "{a:", '"#{', '"\\(', "? ", "(/[", "match;",
    ];
    let slowest = 0;
    let worst = "";
    for (const pattern of patterns) {
      const text = pattern.repeat(Math.ceil(32000 / pattern.length)).slice(0, 32000);
      const start = performance.now();
      const tokens = language.tokenize(text);
      const elapsed = performance.now() - start;
      expect(tokens.map((t) => t.text).join("")).toBe(text);
      if (elapsed > slowest) [slowest, worst] = [elapsed, pattern];
    }
    expect(slowest, `slowest pattern: ${JSON.stringify(worst)}`).toBeLessThan(400);
  });

  it("detects its own sample", () => {
    if (language.id === "plain") return;
    expect(language.score(language.sample)).toBeGreaterThanOrEqual(3);
  });
});

describe("shell", () => {
  it("separates commands, flags and arguments", () => {
    expect(lex("shell", "sudo apt-get install -y nginx")).toEqual([
      ["function", "sudo"],
      ["function", "apt-get"],
      ["plain", "install"],
      ["attribute", "-y"],
      ["plain", "nginx"],
    ]);
    expect(lex("shell", "ls -la | grep err > out.txt 2>&1")).toEqual([
      ["function", "ls"],
      ["attribute", "-la"],
      ["operator", "|"],
      ["function", "grep"],
      ["plain", "err"],
      ["operator", ">"],
      ["plain", "out.txt"],
      ["operator", "2>&1"],
    ]);
  });

  it("only treats keywords as keywords in command position", () => {
    expect(typeOf("shell", "echo done", "done")).toBe("plain");
    expect(lex("shell", 'for f in *.txt; do echo "$f"; done').map(([type]) => type)).toEqual([
      "control", "variable", "control", "plain", "operator", "control", "builtin", "string", "variable", "string",
      "operator", "control",
    ]);
  });

  it("lexes assignments, flags with values and expansions", () => {
    expect(lex("shell", 'NAME="x y" ./run.sh --verbose=true')).toEqual([
      ["variable", "NAME"],
      ["operator", "="],
      ["string", '"x y"'],
      ["function", "./run.sh"],
      ["attribute", "--verbose"],
      ["operator", "="],
      ["plain", "true"],
    ]);
    expect(lex("shell", "x=$(date +%s)")).toEqual([
      ["variable", "x"],
      ["operator", "="],
      ["interpolation", "$("],
      ["function", "date"],
      ["plain", "+%s"],
      ["interpolation", ")"],
    ]);
    expect(typeOf("shell", "echo ${HOME:-/tmp}", "${HOME:-/tmp}")).toBe("variable");
  });

  it("recognises prompts, comments and here-documents", () => {
    expect(lex("shell", "$ docker ps -a")[0]).toEqual(["comment", "$ "]);
    expect(lex("shell", "root@box:~# whoami")[0]).toEqual(["comment", "root@box:~# "]);
    expect(lex("shell", "echo a#b # note")).toEqual([
      ["builtin", "echo"],
      ["plain", "a#b"],
      ["comment", "# note"],
    ]);
    expect(lex("shell", "cat <<EOF\nhello $USER\nEOF\necho hi")).toEqual([
      ["function", "cat"],
      ["operator", "<<"],
      ["string", "EOF"],
      ["string", "hello $USER\nEOF"],
      ["builtin", "echo"],
      ["plain", "hi"],
    ]);
  });

  it("lexes test brackets", () => {
    expect(lex("shell", 'if [ -f "$f" ]; then').map(([type]) => type)).toEqual([
      "control", "builtin", "attribute", "string", "variable", "string", "builtin", "operator", "control",
    ]);
  });
});

describe("powershell", () => {
  it("colours cmdlets, parameters, variables and operators", () => {
    expect(lex("powershell", "Get-ChildItem -Path $env:TEMP | Where-Object { $_.Length -gt 1MB }")).toEqual([
      ["function", "Get-ChildItem"],
      ["attribute", "-Path"],
      ["variable", "$env:TEMP"],
      ["operator", "|"],
      ["function", "Where-Object"],
      ["bracket0", "{"],
      ["variable", "$_"],
      ["punctuation", "."],
      ["variable", "Length"],
      ["keyword", "-gt"],
      ["number", "1MB"],
      ["bracket0", "}"],
    ]);
  });

  it("lexes type literals, interpolated strings and constants", () => {
    expect(lex("powershell", '[string]$name = "Hi $user `n"')).toEqual([
      ["type", "[string]"],
      ["variable", "$name"],
      ["operator", "="],
      ["string", '"Hi '],
      ["variable", "$user"],
      ["escape", "`n"],
      ["string", '"'],
    ]);
    expect(typeOf("powershell", "$x = $true", "$true")).toBe("constant");
    expect(lex("powershell", "<# block #> # line")).toEqual([
      ["comment", "<# block #>"],
      ["comment", "# line"],
    ]);
    expect(lex("powershell", "PS C:\\> Get-Date")[0]).toEqual(["comment", "PS C:\\> "]);
  });
});

describe("sql", () => {
  it("colours keywords case-insensitively and leaves names plain", () => {
    expect(lex("sql", "SELECT name, COUNT(*) FROM users WHERE id = 1 -- note")).toEqual([
      ["keyword", "SELECT"],
      ["plain", "name"],
      ["punctuation", ","],
      ["function", "COUNT"],
      ["bracket0", "("],
      ["operator", "*"],
      ["bracket0", ")"],
      ["keyword", "FROM"],
      ["plain", "users"],
      ["keyword", "WHERE"],
      ["plain", "id"],
      ["operator", "="],
      ["number", "1"],
      ["comment", "-- note"],
    ]);
    expect(typeOf("sql", "select * from t", "select")).toBe("keyword");
    expect(typeOf("sql", "name VARCHAR(10) NULL", "VARCHAR")).toBe("type");
    expect(typeOf("sql", "name VARCHAR(10) NULL", "NULL")).toBe("constant");
  });

  it("lexes strings, quoted names and parameters", () => {
    expect(lex("sql", "WHERE a = 'it''s' AND [Order Id] = @id AND #tmp.x = :p")).toEqual([
      ["keyword", "WHERE"],
      ["plain", "a"],
      ["operator", "="],
      ["string", "'it''s'"],
      ["keyword", "AND"],
      ["variable", "[Order Id]"],
      ["operator", "="],
      ["variable", "@id"],
      ["keyword", "AND"],
      ["variable", "#tmp"],
      ["punctuation", "."],
      ["plain", "x"],
      ["operator", "="],
      ["variable", ":p"],
    ]);
  });
});

describe("json", () => {
  it("separates keys from values", () => {
    expect(lex("json", '{"a": [1, true, null], "b": "x\\n"}')).toEqual([
      ["bracket0", "{"],
      ["property", '"a"'],
      ["punctuation", ":"],
      ["bracket1", "["],
      ["number", "1"],
      ["punctuation", ","],
      ["constant", "true"],
      ["punctuation", ","],
      ["constant", "null"],
      ["bracket1", "]"],
      ["punctuation", ","],
      ["property", '"b"'],
      ["punctuation", ":"],
      ["string", '"x'],
      ["escape", "\\n"],
      ["string", '"'],
      ["bracket0", "}"],
    ]);
  });
});

describe("yaml", () => {
  it("lexes keys, scalars, comments, lists and block scalars", () => {
    const src = 'name: web  # app\nports:\n  - 80\n  - "443"\nenabled: true\nrun: |\n  echo hi\n  exit 0\nnext: 1';
    expect(lex("yaml", src)).toEqual([
      ["property", "name"],
      ["punctuation", ":"],
      ["string", "web"],
      ["comment", "# app"],
      ["property", "ports"],
      ["punctuation", ":"],
      ["punctuation", "-"],
      ["number", "80"],
      ["punctuation", "-"],
      ["string", '"443"'],
      ["property", "enabled"],
      ["punctuation", ":"],
      ["constant", "true"],
      ["property", "run"],
      ["punctuation", ":"],
      ["operator", "|"],
      ["string", "echo hi"],
      ["string", "exit 0"],
      ["property", "next"],
      ["punctuation", ":"],
      ["number", "1"],
    ]);
  });
});

describe("markup", () => {
  it("lexes tags, attributes, entities and text", () => {
    expect(lex("markup", '<a href="/x" target=_blank>Go &amp; see</a>')).toEqual([
      ["punctuation", "<"],
      ["tag", "a"],
      ["attribute", "href"],
      ["operator", "="],
      ["string", '"/x"'],
      ["attribute", "target"],
      ["operator", "="],
      ["string", "_blank"],
      ["punctuation", ">"],
      ["plain", "Go"],
      ["escape", "&amp;"],
      ["plain", "see"],
      ["punctuation", "</"],
      ["tag", "a"],
      ["punctuation", ">"],
    ]);
  });

  it("highlights embedded scripts and styles with their own languages", () => {
    expect(typeOf("markup", "<script>let x = 1;</script>", "let")).toBe("storage");
    expect(typeOf("markup", "<style>p { color: red; }</style>", "color")).toBe("property");
    expect(typeOf("markup", "<!-- note -->", "<!-- note -->")).toBe("comment");
  });
});

describe("css", () => {
  it("separates selectors, properties and values", () => {
    expect(lex("css", ".a:hover > b { color: #fff; margin: 0 auto !important; }")).toEqual([
      ["selector", ".a:hover"],
      ["operator", ">"],
      ["selector", "b"],
      ["bracket0", "{"],
      ["property", "color"],
      ["punctuation", ":"],
      ["number", "#fff"],
      ["punctuation", ";"],
      ["property", "margin"],
      ["punctuation", ":"],
      ["number", "0"],
      ["string", "auto"],
      ["keyword", "!important"],
      ["punctuation", ";"],
      ["bracket0", "}"],
    ]);
    expect(typeOf("css", "a { color: var(--brand); }", "--brand")).toBe("variable");
    expect(typeOf("css", "@media (max-width: 600px) {}", "max-width")).toBe("property");
  });
});

describe("javascript / typescript", () => {
  it("tells regex literals from division", () => {
    expect(typeOf("javascript", "const re = /ab+c/gi;", "/ab+c/gi")).toBe("regex");
    expect(lex("javascript", "a / b / c").map(([type]) => type)).toEqual([
      "variable", "operator", "variable", "operator", "variable",
    ]);
  });

  it("highlights template literal interpolation", () => {
    expect(lex("javascript", "`x ${y + 1}`")).toEqual([
      ["string", "`x "],
      ["interpolation", "${"],
      ["variable", "y"],
      ["operator", "+"],
      ["number", "1"],
      ["interpolation", "}"],
      ["string", "`"],
    ]);
  });

  it("classifies members, classes and builtins", () => {
    expect(lex("javascript", "obj?.items.map(fn)").map(([type]) => type)).toEqual([
      "variable", "operator", "variable", "punctuation", "function", "bracket0", "variable", "bracket0",
    ]);
    expect(typeOf("javascript", "console.log(x)", "console")).toBe("builtin");
    expect(typeOf("javascript", "class A extends B {}", "B")).toBe("class");
    expect(typeOf("javascript", "promise.catch(handle)", "catch")).toBe("function");
    expect(typeOf("typescript", "function f(x: number): string {}", "number")).toBe("type");
    expect(typeOf("typescript", "interface User {}", "User")).toBe("class");
  });
});

describe("java / c# / c / c++", () => {
  it("handles annotations and char literals", () => {
    expect(typeOf("java", "@Override public String toString() {}", "@Override")).toBe("decorator");
    expect(typeOf("java", "@Override public String toString() {}", "toString")).toBe("function");
    expect(typeOf("java", "char c = 'a';", "'a'")).toBe("string");
  });

  it("handles C# interpolated and verbatim strings", () => {
    expect(lex("csharp", 'var s = $"Hi {name,10:F2} {{x}}";')).toEqual([
      ["storage", "var"],
      ["variable", "s"],
      ["operator", "="],
      ["string", '$"Hi '],
      ["interpolation", "{"],
      ["variable", "name"],
      ["interpolation", ",10:F2}"],
      ["escape", "{{"],
      ["string", "x"],
      ["escape", "}}"],
      ["string", '"'],
      ["punctuation", ";"],
    ]);
    expect(lex("csharp", '@"C:\\temp\\new"')).toEqual([["string", '@"C:\\temp\\new"']]);
    expect(typeOf("csharp", 'Console.WriteLine("x");', "WriteLine")).toBe("function");
    expect(typeOf("csharp", "#region Setup", "#region")).toBe("control");
  });

  it("handles the C preprocessor, escapes and C++ namespaces", () => {
    expect(lex("c", "#include <stdio.h>")).toEqual([
      ["control", "#include"],
      ["string", "<stdio.h>"],
    ]);
    expect(typeOf("c", 'printf("%d\\n", p->next);', "\\n")).toBe("escape");
    expect(typeOf("c", 'printf("%d\\n", p->next);', "next")).toBe("variable");
    expect(lex("cpp", "std::vector<int> v;").slice(0, 3)).toEqual([
      ["builtin", "std"],
      ["operator", "::"],
      ["type", "vector"],
    ]);
    expect(typeOf("cpp", 'auto s = R"(raw \\n)";', 'R"(raw \\n)"')).toBe("string");
  });
});

describe("go / rust", () => {
  it("handles Go raw strings, runes and exported methods", () => {
    expect(typeOf("go", "x := `raw\\n`", "`raw\\n`")).toBe("string");
    expect(typeOf("go", "r := 'a'", "'a'")).toBe("string");
    expect(typeOf("go", "func (s *Server) Start() error {", "Start")).toBe("function");
    expect(typeOf("go", "func (s *Server) Start() error {", "error")).toBe("type");
  });

  it("handles Rust lifetimes, macros, attributes and raw strings", () => {
    expect(typeOf("rust", "fn longest<'a>(x: &'a str) -> &'a str {", "'a")).toBe("storage");
    expect(typeOf("rust", 'println!("{}", x);', "println!")).toBe("builtin");
    expect(typeOf("rust", "#[derive(Debug)]", "#[derive(Debug)]")).toBe("decorator");
    expect(typeOf("rust", 'let s = r#"a "b""#;', 'r#"a "b""#')).toBe("string");
    expect(typeOf("rust", "Some(x)", "Some")).toBe("builtin");
    expect(typeOf("rust", "let c = b'a';", "b'a'")).toBe("string");
  });
});

describe("kotlin / swift / dart / scala", () => {
  it("highlights string templates in each language's style", () => {
    expect(lex("kotlin", 'val s = "Hi ${user.name} and $x"')).toEqual([
      ["storage", "val"],
      ["variable", "s"],
      ["operator", "="],
      ["string", '"Hi '],
      ["interpolation", "${"],
      ["variable", "user"],
      ["punctuation", "."],
      ["variable", "name"],
      ["interpolation", "}"],
      ["string", " and "],
      ["variable", "$x"],
      ["string", '"'],
    ]);
    expect(lex("swift", 'print("Tapped \\(count) times")')).toEqual([
      ["builtin", "print"],
      ["bracket0", "("],
      ["string", '"Tapped '],
      ["interpolation", "\\("],
      ["variable", "count"],
      ["interpolation", ")"],
      ["string", ' times"'],
      ["bracket0", ")"],
    ]);
    expect(lex("dart", "'Hello $name'")).toEqual([
      ["string", "'Hello "],
      ["variable", "$name"],
      ["string", "'"],
    ]);
    expect(typeOf("scala", "case class Person(name: String)", "Person")).toBe("class");
    expect(typeOf("swift", "@State private var count = 0", "@State")).toBe("decorator");
  });
});

describe("php / ruby / lua / r / terraform", () => {
  it("handles PHP tags, $this, variables and heredocs", () => {
    expect(lex("php", "<?php $this->save($id); ?>")).toEqual([
      ["keyword", "<?php"],
      ["self", "$this"],
      ["operator", "->"],
      ["function", "save"],
      ["bracket0", "("],
      ["variable", "$id"],
      ["bracket0", ")"],
      ["punctuation", ";"],
      ["keyword", "?>"],
    ]);
    expect(lex("php", "$s = <<<EOT\nHi $name\nEOT;")).toEqual([
      ["variable", "$s"],
      ["operator", "="],
      ["string", "<<<EOT"],
      ["string", "Hi $name\nEOT"],
      ["punctuation", ";"],
    ]);
  });

  it("handles Ruby symbols, predicates, ivars, interpolation and =begin", () => {
    expect(lex("ruby", "attr_reader :items")).toEqual([
      ["storage", "attr_reader"],
      ["constant", ":items"],
    ]);
    expect(typeOf("ruby", "def overdue?", "overdue?")).toBe("function");
    expect(typeOf("ruby", "@count += 1", "@count")).toBe("variable");
    expect(typeOf("ruby", '{ name: "x" }', "name")).toBe("constant");
    expect(lex("ruby", '"Total: #{x}"')).toEqual([
      ["string", '"Total: '],
      ["interpolation", "#{"],
      ["variable", "x"],
      ["interpolation", "}"],
      ["string", '"'],
    ]);
    expect(lex("ruby", "=begin\nnote\n=end")).toEqual([["comment", "=begin\nnote\n=end"]]);
  });

  it("handles Lua long brackets and method calls", () => {
    expect(lex("lua", "--[[ block ]] local s = [[long]]")).toEqual([
      ["comment", "--[[ block ]]"],
      ["storage", "local"],
      ["variable", "s"],
      ["operator", "="],
      ["string", "[[long]]"],
    ]);
    expect(typeOf("lua", "obj:method()", "method")).toBe("function");
  });

  it("handles R arrows, pipes and dotted names", () => {
    expect(lex("r", 'df <- read.csv("a.csv") %>% filter(x > 1)').map(([type, text]) => `${type}:${text}`)).toEqual([
      "variable:df", "operator:<-", "builtin:read.csv", "bracket0:(", 'string:"a.csv"', "bracket0:)",
      "operator:%>%", "builtin:filter", "bracket0:(", "variable:x", "operator:>", "number:1", "bracket0:)",
    ]);
  });

  it("handles Terraform attributes and interpolation", () => {
    expect(lex("terraform", 'bucket = "${var.prefix}-logs"')).toEqual([
      ["property", "bucket"],
      ["operator", "="],
      ["string", '"'],
      ["interpolation", "${"],
      ["self", "var"],
      ["punctuation", "."],
      ["variable", "prefix"],
      ["interpolation", "}"],
      ["string", '-logs"'],
    ]);
    expect(typeOf("terraform", 'resource "aws_s3_bucket" "b" {', "resource")).toBe("storage");
  });
});

describe("vba / batch", () => {
  it("lexes VBA case-insensitively with ' comments and doubled quotes", () => {
    expect(lex("vb", "Dim x As Long ' counter")).toEqual([
      ["storage", "Dim"],
      ["variable", "x"],
      ["storage", "As"],
      ["type", "Long"],
      ["comment", "' counter"],
    ]);
    expect(lex("vb", 'MsgBox "Hi ""there"""')).toEqual([
      ["builtin", "MsgBox"],
      ["string", '"Hi ""there"""'],
    ]);
    expect(typeOf("vb", "Public Sub Run()", "Run")).toBe("function");
    expect(typeOf("vb", "if x > 0 then", "then")).toBe("control");
    expect(lex("vb", "Rem note")).toEqual([["comment", "Rem note"]]);
  });

  it("lexes batch commands, variables, flags and labels", () => {
    expect(lex("batch", "@echo off")).toEqual([
      ["operator", "@"],
      ["builtin", "echo"],
      ["plain", "off"],
    ]);
    expect(lex("batch", "set NAME=Bob")).toEqual([
      ["builtin", "set"],
      ["variable", "NAME"],
      ["operator", "="],
      ["plain", "Bob"],
    ]);
    expect(lex("batch", "for %%f in (*.txt) do echo %%f").map(([type]) => type)).toEqual([
      "control", "variable", "control", "bracket0", "plain", "bracket0", "control", "builtin", "variable",
    ]);
    expect(lex("batch", "copy /Y a b >nul")).toEqual([
      ["builtin", "copy"],
      ["attribute", "/Y"],
      ["plain", "a b"],
      ["operator", ">"],
      ["plain", "nul"],
    ]);
    expect(lex("batch", "REM note")).toEqual([["comment", "REM note"]]);
    expect(lex("batch", ":loop")).toEqual([["function", ":loop"]]);
  });
});

describe("dockerfile / markdown / toml / diff", () => {
  it("lexes Dockerfile instructions and hands RUN to the shell lexer", () => {
    expect(lex("dockerfile", "FROM node:22 AS build")).toEqual([
      ["control", "FROM"],
      ["class", "node:22"],
      ["keyword", "AS"],
      ["class", "build"],
    ]);
    expect(lex("dockerfile", "RUN apt-get update && echo $HOME")).toEqual([
      ["control", "RUN"],
      ["function", "apt-get"],
      ["plain", "update"],
      ["operator", "&&"],
      ["builtin", "echo"],
      ["variable", "$HOME"],
    ]);
    expect(lex("dockerfile", "ENV PORT=80")).toEqual([
      ["control", "ENV"],
      ["property", "PORT"],
      ["operator", "="],
      ["number", "80"],
    ]);
    expect(typeOf("dockerfile", 'CMD ["nginx", "-g"]', '"nginx"')).toBe("string");
  });

  it("lexes Markdown blocks, inline styles, links and fenced code", () => {
    expect(lex("markdown", "# Title")).toEqual([["heading", "# Title"]]);
    expect(lex("markdown", "**bold** and *it* and `code` and snake_case_word")).toEqual([
      ["strong", "**bold**"],
      ["plain", "and"],
      ["emphasis", "*it*"],
      ["plain", "and"],
      ["string", "`code`"],
      ["plain", "and snake_case_word"],
    ]);
    expect(lex("markdown", "[docs](https://x.io)")).toEqual([
      ["punctuation", "["],
      ["link", "docs"],
      ["punctuation", "]("],
      ["string", "https://x.io"],
      ["punctuation", ")"],
    ]);
    expect(lex("markdown", "```python\nx = 1\n```")).toEqual([
      ["punctuation", "```python"],
      ["variable", "x"],
      ["operator", "="],
      ["number", "1"],
      ["punctuation", "```"],
    ]);
  });

  it("lexes TOML and INI", () => {
    expect(lex("toml", '[server]\nport = 8080 # c\nflags = { a = true, b = 2 }')).toEqual([
      ["tag", "[server]"],
      ["property", "port"],
      ["operator", "="],
      ["number", "8080"],
      ["comment", "# c"],
      ["property", "flags"],
      ["operator", "="],
      ["bracket0", "{"],
      ["property", "a"],
      ["operator", "="],
      ["constant", "true"],
      ["punctuation", ","],
      ["property", "b"],
      ["operator", "="],
      ["number", "2"],
      ["bracket0", "}"],
    ]);
    expect(lex("toml", "[db]\nhost=localhost\n; note")).toEqual([
      ["tag", "[db]"],
      ["property", "host"],
      ["operator", "="],
      ["string", "localhost"],
      ["comment", "; note"],
    ]);
  });

  it("lexes diffs line by line", () => {
    expect(lex("diff", "@@ -1 +1 @@ fn\n-a\n+b\n c")).toEqual([
      ["interpolation", "@@ -1 +1 @@"],
      ["plain", "fn"],
      ["deleted", "-a"],
      ["inserted", "+b"],
      ["plain", "c"],
    ]);
  });
});

describe("review regressions", () => {
  it("never splits an emoji between differently styled runs", async () => {
    const { buildRuns } = await import("../src/highlighter/runs");
    const { THEMES } = await import("../src/highlighter/themes");
    for (const [id, src] of [
      ["shell", "echo \\\u{1F600} done"],
      ["css", "a { content: \"\\\u{1F600}\"; }"],
      ["sql", "SELECT E'\\\u{1F600}'"],
      ["batch", "echo ^\u{1F600}"],
    ]) {
      for (const run of buildRuns(getLanguage(id).tokenize(src), THEMES[0])) {
        expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(run.text), `${id}: ${JSON.stringify(run.text)}`).toBe(false);
      }
    }
  });

  it("keeps table names plain before a column list", () => {
    expect(typeOf("sql", "INSERT INTO orders (id, total) VALUES (1, 9.99);", "orders")).toBe("plain");
  });

  it("treats PowerShell hashtable keys as properties", () => {
    expect(typeOf("powershell", "[PSCustomObject]@{ Name = $u.Name; Email = $u.Mail }", "Name")).toBe("property");
    expect(typeOf("powershell", "@{\n  Name = 'x'\n  Email = 'y'\n}", "Email")).toBe("property");
  });

  it("divides after a postfix increment", () => {
    expect(lex("javascript", "let x = a++ / 2; let y = b-- / 3;").some(([type]) => type === "regex")).toBe(false);
  });

  it("splits YAML flow collections into keys and values", () => {
    expect(lex("yaml", "matrix: { os: [ubuntu-latest, windows-latest], node: [18, 20] }")).toEqual([
      ["property", "matrix"],
      ["punctuation", ":"],
      ["bracket0", "{"],
      ["property", "os"],
      ["punctuation", ":"],
      ["bracket1", "["],
      ["string", "ubuntu-latest"],
      ["punctuation", ","],
      ["string", "windows-latest"],
      ["bracket1", "]"],
      ["punctuation", ","],
      ["property", "node"],
      ["punctuation", ":"],
      ["bracket1", "["],
      ["number", "18"],
      ["punctuation", ","],
      ["number", "20"],
      ["bracket1", "]"],
      ["bracket0", "}"],
    ]);
  });

  it("survives nesting thousands of levels deep", () => {
    for (const [id, src] of [
      ["python", "f\"{f'{".repeat(3000)],
      ["javascript", "`${".repeat(3000)],
      ["csharp", '$"{'.repeat(3000)],
      ["shell", "$(".repeat(3000)],
      ["powershell", '"$('.repeat(3000)],
      ["kotlin", '"${'.repeat(3000)],
      ["ruby", '"#{'.repeat(3000)],
      ["swift", '"\\('.repeat(3000)],
    ]) {
      expect(getLanguage(id).tokenize(src).map((t) => t.text).join("")).toBe(src);
    }
  });
});
