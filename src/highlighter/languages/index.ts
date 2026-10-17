import { CODE_THRESHOLD } from "../signals";
import type { Language } from "../types";
import { batch } from "./batch";
import { c, cpp, csharp, dart, go, java, javascript, kotlin, rust, scala, swift, typescript } from "./clike";
import { css } from "./css";
import { diff } from "./diff";
import { dockerfile } from "./dockerfile";
import { json } from "./json";
import { fenceLanguages, markdown } from "./markdown";
import { markup } from "./markup";
import { powershell } from "./powershell";
import { python } from "./python";
import { lua, php, r, ruby, terraform } from "./scripting";
import { shell } from "./shell";
import { sql } from "./sql";
import { toml } from "./toml";
import { vb } from "./vb";
import { yaml } from "./yaml";

/** Text shown in a monospace font with no syntax colours. */
export const plainText: Language = {
  id: "plain",
  name: "Plain text",
  tokenize: (source) => (source ? [{ type: "plain", text: source }] : []),
  score: () => 0,
  sample: "Any text, set in a monospace font\nwithout syntax colours.",
};

/** Every language, in menu order. On equal detection scores, earlier wins. */
export const LANGUAGES: Language[] = [
  python,
  shell,
  powershell,
  batch,
  sql,
  javascript,
  typescript,
  java,
  csharp,
  vb,
  c,
  cpp,
  go,
  rust,
  kotlin,
  swift,
  php,
  ruby,
  r,
  scala,
  dart,
  lua,
  markup,
  css,
  json,
  yaml,
  toml,
  markdown,
  dockerfile,
  terraform,
  diff,
  plainText,
];

/** The language setting that means "work it out per cell". */
export const AUTO = "auto";

/** Names used after ``` in Markdown, and other common aliases. */
const ALIASES: Record<string, string> = {
  py: "python", python3: "python", sh: "shell", bash: "shell", zsh: "shell", console: "shell",
  terminal: "shell", ps1: "powershell", pwsh: "powershell", bat: "batch", cmd: "batch",
  mysql: "sql", postgres: "sql", postgresql: "sql", tsql: "sql", plsql: "sql", js: "javascript",
  jsx: "javascript", mjs: "javascript", node: "javascript", ts: "typescript", tsx: "typescript",
  cs: "csharp", "c#": "csharp", vba: "vb", vbnet: "vb", vbscript: "vb", h: "c", "c++": "cpp",
  cc: "cpp", cxx: "cpp", hpp: "cpp", golang: "go", rs: "rust", kt: "kotlin", kts: "kotlin",
  rb: "ruby", sc: "scala", html: "markup", xml: "markup", svg: "markup", xhtml: "markup",
  scss: "css", less: "css", jsonc: "json", json5: "json", yml: "yaml", ini: "toml", cfg: "toml",
  conf: "toml", properties: "toml", md: "markdown", docker: "dockerfile", hcl: "terraform",
  tf: "terraform", patch: "diff",
};

export function getLanguage(id: string): Language {
  return findLanguage(id) ?? plainText;
}

/** A language by id or common alias (case-insensitive), or null. */
export function findLanguage(name: string): Language | null {
  const key = name.toLowerCase();
  const id = ALIASES[key] ?? key;
  return LANGUAGES.find((l) => l.id === id) ?? null;
}

fenceLanguages.find = findLanguage;

interface Ranked {
  language: Language;
  score: number;
}

function best(text: string): Ranked | null {
  if (text.trim().length < 2) return null;
  let top: Ranked | null = null;
  for (const language of LANGUAGES) {
    const score = language.score(text);
    if (score > (top?.score ?? 0)) top = { language, score };
  }
  return top;
}

/** The language `text` is clearly written in, or null when it doesn't look like code. */
export function detectLanguage(text: string): Language | null {
  const top = best(text);
  return top && top.score >= CODE_THRESHOLD ? top.language : null;
}

/** The likeliest language for text the user asked to highlight; plain text if there's no evidence. */
export function guessLanguage(text: string): Language {
  return best(text)?.language ?? plainText;
}
