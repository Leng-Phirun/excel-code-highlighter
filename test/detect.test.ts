import { describe, expect, it } from "vitest";
import { detectLanguage, guessLanguage, LANGUAGES } from "../src/highlighter/languages";

const CODE: Record<string, string[]> = {
  python: [
    'print("Hello, world!")',
    "import pandas as pd",
    "from collections import defaultdict",
    "df = pd.read_csv('data.csv')",
    "def add(a, b):\n    return a + b",
    "for i in range(10):\n    print(i)",
    "class Config:\n    debug = False",
    "@dataclass\nclass Point:\n    x: int\n    y: int",
    "try:\n    risky()\nexcept ValueError as e:\n    log(e)",
    "with open('f.txt') as fh:\n    data = fh.read()",
    "squares = [x * x for x in range(5) if x % 2]",
    ">>> 1 + 1\n2",
    "if __name__ == '__main__':\n    main()",
    "self.total = sum(self.items)",
  ],
  shell: [
    "ls -la /var/log",
    "sudo apt-get install -y nginx",
    "$ docker run -it --rm -p 8080:80 nginx",
    'git commit -m "fix typo" && git push origin main',
    '#!/bin/bash\necho "Hello $USER"',
    "find . -name '*.log' -mtime +7 -delete",
    "curl -s https://api.example.com/users | jq '.[] | .name'",
    "kubectl get pods -n kube-system",
    "user@server:~$ tail -f /var/log/syslog",
    "chmod +x deploy.sh && ./deploy.sh",
    "export PATH=$PATH:/usr/local/go/bin",
    'for f in *.txt; do\n  mv "$f" "${f%.txt}.md"\ndone',
    "pip install requests",
    "npm install --save-dev typescript",
  ],
  powershell: [
    "Get-ChildItem -Path C:\\Logs -Recurse | Where-Object { $_.Length -gt 1MB }",
    "$env:PATH += ';C:\\tools'",
    'Write-Host "Done" -ForegroundColor Green',
    "PS C:\\Users\\me> Set-ExecutionPolicy RemoteSigned -Scope CurrentUser",
  ],
  sql: [
    "SELECT * FROM users WHERE id = 1;",
    "select name, email from customers where active = 1",
    "INSERT INTO orders (id, total) VALUES (1, 9.99);",
    "UPDATE products SET price = price * 1.1 WHERE category = 'books';",
    "CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(100)\n);",
  ],
  javascript: [
    "console.log('hello')",
    "const add = (a, b) => a + b;",
    "document.querySelector('#app').addEventListener('click', handler);",
    "import React from 'react';",
    "function greet(name) {\n  return `Hi ${name}`;\n}",
  ],
  typescript: [
    "interface User {\n  id: number;\n  name: string;\n}",
    "const total: number = items.reduce((s, i) => s + i.price, 0);",
    "export type Status = 'open' | 'closed';",
  ],
  java: [
    'System.out.println("Hello, World!");',
    "public static void main(String[] args) {\n    List<String> names = new ArrayList<>();\n}",
  ],
  csharp: [
    'Console.WriteLine($"Hello {name}");',
    "using System;\n\nnamespace Demo\n{\n    public class Person { public string Name { get; set; } }\n}",
  ],
  c: ['#include <stdio.h>\n\nint main(void) {\n    printf("hi\\n");\n    return 0;\n}'],
  cpp: ['#include <iostream>\nint main() { std::cout << "hi" << std::endl; }'],
  go: [
    'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hi")\n}',
    "if err != nil {\n\treturn err\n}",
  ],
  rust: ['fn main() {\n    println!("Hello, world!");\n}', "let mut v: Vec<i32> = Vec::new();"],
  json: ['{"name": "x", "tags": [1, 2]}', '[{"id": 1}, {"id": 2}]'],
  yaml: [
    "apiVersion: v1\nkind: Pod\nmetadata:\n  name: web",
    "name: build\non:\n  push:\n    branches: [main]",
    "version: 3\nservices:\n  web:\n    image: nginx",
  ],
  markup: [
    '<div class="card"><p>Hello</p></div>',
    '<?xml version="1.0"?>\n<note><to>Tove</to></note>',
    "<!DOCTYPE html>\n<html><body></body></html>",
  ],
  css: [
    ".btn { color: #fff; padding: 4px 8px; }",
    "@media (max-width: 600px) {\n  .nav { display: none; }\n}",
    "body {\n  margin: 0;\n  font-family: sans-serif;\n}",
  ],
  batch: [
    "@echo off\necho Hello %USERNAME%",
    'if not exist "C:\\temp" mkdir "C:\\temp"',
    "for %%f in (*.txt) do type %%f",
    "echo Hello %USERNAME%",
  ],
  vb: [
    'Sub Hello()\n    MsgBox "Hi"\nEnd Sub',
    'Dim ws As Worksheet\nSet ws = ThisWorkbook.Sheets("Data")',
    'Range("A1").Value = 42\nDebug.Print Range("A1").Value',
  ],
  kotlin: [
    'fun greet(name: String) = println("Hi $name")',
    "data class Point(val x: Int, val y: Int)",
    "val items = listOf(1, 2, 3)",
  ],
  swift: [
    "import SwiftUI",
    "guard let user = user else { return }",
    'func greet(_ name: String) -> String {\n    return "Hi \\(name)"\n}',
  ],
  scala: [
    "case class Person(name: String, age: Int)",
    'object Main extends App {\n  println("hi")\n}',
    "def add(a: Int, b: Int): Int = a + b",
  ],
  dart: [
    "import 'package:http/http.dart' as http;",
    "void main() {\n  print('Hello, $name');\n}",
    "Future<void> load() async {\n  final data = await fetch();\n}",
    "import 'package:flutter/material.dart';\nvoid main() => runApp(const MyApp());",
  ],
  php: ["<?php echo 'hi'; ?>", "$this->name = $name;", "foreach ($items as $item) {\n    echo $item;\n}"],
  ruby: [
    "puts 'Hello'",
    'def greet(name)\n  "Hi #{name}"\nend',
    "[1, 2, 3].each do |n|\n  puts n\nend",
    "attr_accessor :name, :email",
  ],
  lua: ["local x = 10\nprint(x)", "for i, v in ipairs(t) do\n  print(i, v)\nend", "if a ~= b then\n  return nil\nend"],
  r: ["library(ggplot2)", "x <- c(1, 2, 3)\nmean(x)", "df %>% filter(age > 30)"],
  terraform: [
    'resource "aws_instance" "web" {\n  ami = "ami-123"\n}',
    'variable "region" {\n  default = "us-east-1"\n}',
  ],
  dockerfile: [
    "FROM python:3.12-slim\nRUN pip install flask",
    'FROM ubuntu:24.04\nRUN apt-get update && apt-get install -y curl\nCMD ["bash"]',
  ],
  markdown: [
    "# Title\n\nSome **bold** text and a [link](https://example.com).",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    "```python\nprint(1)\n```",
  ],
  toml: ['[server]\nhost = "0.0.0.0"\nport = 8080', '[[products]]\nname = "Hammer"\nsku = 738594937'],
  diff: ["@@ -1,3 +1,4 @@\n-old\n+new", "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-a\n+b"],
};

const NOT_CODE = [
  "Hello world",
  "Total",
  "x = 5",
  "None of the above",
  "Please call me tomorrow (if possible).",
  "Note: see section 3 for details.",
  "for example, in this case: use the other form",
  "If you need help: call the desk",
  "Import data from the shared drive",
  "Meeting notes\n- agree budget\n- review plan",
  "Q3 revenue grew 12% year over year.",
  "https://example.com/path?a=1",
  "Name: John\nAge: 30",
  "Buy milk, eggs and bread",
  "Total: $45.00",
  "Call me at 555-1234",
  "The meeting is at 3pm (room 4).",
  "TODO: update the budget sheet",
  "Q3: revenue up; costs down",
  "Select an item from the list below",
  "find the root cause and fix it",
  "make sure the report is done",
  "Let me know if you need help: email or phone",
  "<3 thanks!",
  "a < b and c > d",
  "Price - discount = total",
  "Email: someone@example.com",
  "Step 1: open the file\nStep 2: save it",
  "notes: call bob\ntodo: send invoice",
  "- buy milk\n- walk dog",
  "+ faster\n- more expensive",
  "FROM: Alice",
  "FROM Alice",
  "ADD 2 more chairs",
  "# Agenda\nBudget review",
  "COPY THAT",
  "end",
  "Done.",
  "R&D budget",
  "C# developer needed",
  "Swift code: ABCDUS33",
  "Ruby's birthday party",
  "nil",
  "TRUE",
  "N/A",
  "Dim the lights at 9pm",
  "local shop opens at 9",
  "puts it simply",
  "Next week",
  "Set up the meeting",
  "Price: $5 = $3 + $2",
  "Fun times ahead",
  "def leppard concert (1987)",
  "When: 3pm\nWhere: Room 4",
  "Option A or option B?",
  "Data class: confidential",
  // Found by review: each once scored as code on a single signal.
  "Write-Off approved by CFO",
  "Set-Up fee waived",
  "Read-Only access",
  "Pop-Up shop",
  "Create table of contents",
  "Insert into Q3 report",
  "Delete from list after review",
  "Update status set to closed",
  "Select top 3 from each region",
  "export to excel and send to team",
  "ps call me back",
  "rm 101 booked",
  "apt 4b, 22 main st",
  "python 3 training",
  "please install the update",
  "$ 500 deposit received",
  "Gluten free (GF)",
  "Signed document.pdf attached",
  "defer payment until March",
  "package deal",
  "[Test] login works",
  "@elonmusk",
  "@channel",
  "class notes:",
];

describe("brace-language snippets", () => {
  it.each([
    ["if (user.isAdmin()) {\n  showPanel(user.name);\n}", null],
    ["items.forEach(item => {\n  total += item.price;\n});", "javascript"],
  ])("are not mistaken for Python: %s", (src, expected) => {
    expect(detectLanguage(src)?.id ?? null).toBe(expected);
  });
});

describe("detection speed", () => {
  it.each([
    ["blank lines", "x" + "\n".repeat(32765) + "x"],
    ["spaced lines", "a\n".repeat(16383)],
    ["brackets", "[".repeat(32767)],
    ["indented blanks", " \n".repeat(16383)],
    ["long line", "a" + " ".repeat(32765) + "x"],
  ])("stays fast on %s", (_name, text) => {
    const start = performance.now();
    detectLanguage(text);
    expect(performance.now() - start).toBeLessThan(400);
  });
});

describe("detectLanguage", () => {
  for (const [id, samples] of Object.entries(CODE)) {
    it.each(samples)(`recognises ${id}: %s`, (src) => {
      expect(detectLanguage(src)?.id).toBe(id);
    });
  }

  it.each(NOT_CODE)("leaves ordinary text alone: %s", (src) => {
    expect(detectLanguage(src)).toBeNull();
  });
});

describe("language samples", () => {
  it.each(LANGUAGES.filter((l) => l.id !== "plain").map((l) => [l.id, l.sample]))(
    "detects the %s sample as itself",
    (id, sample) => {
      expect(detectLanguage(sample)?.id).toBe(id);
    }
  );
});

describe("guessLanguage", () => {
  it("falls back to plain text when nothing looks like code", () => {
    expect(guessLanguage("hello world").id).toBe("plain");
  });

  it("takes weak evidence when the user explicitly asks to highlight", () => {
    expect(guessLanguage("x = 5").id).toBe("python");
  });
});
