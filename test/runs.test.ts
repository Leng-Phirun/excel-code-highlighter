import { describe, expect, it } from "vitest";
import { python } from "../src/highlighter/languages/python";
import { buildRuns } from "../src/highlighter/runs";
import { getTheme, resolveStyle, THEMES } from "../src/highlighter/themes";

describe("buildRuns", () => {
  const theme = getTheme("dark-plus");

  it("spells out the source exactly", () => {
    const src = "def f(x):\n    return x * 2  # double\n";
    for (const t of THEMES) {
      expect(buildRuns(python.tokenize(src), t).map((r) => r.text).join("")).toBe(src);
    }
  });

  it("folds whitespace into the previous run and merges equal styles", () => {
    const runs = buildRuns(python.tokenize("return  x"), theme);
    expect(runs.map((r) => r.text)).toEqual(["return  ", "x"]);
    // `(` and `)` share bracket0's colour and merge across the empty call.
    expect(buildRuns(python.tokenize("f()"), theme).map((r) => r.text)).toEqual(["f", "()"]);
  });

  it("gives leading whitespace the foreground colour", () => {
    const [first] = buildRuns(python.tokenize("   x"), theme);
    expect(first).toEqual({ text: "   ", color: theme.foreground, bold: false, italic: false });
  });

  it("returns no runs for empty text", () => {
    expect(buildRuns(python.tokenize(""), theme)).toEqual([]);
  });
});

describe("themes", () => {
  it("define every colour as #RRGGBB", () => {
    for (const t of THEMES) {
      const colours = [t.background, t.foreground, ...Object.values(t.tokens).map((s) => s!.color)];
      for (const colour of colours) expect(colour).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("fall back through related token types", () => {
    const githubLight = getTheme("github-light");
    expect(resolveStyle(githubLight, "bracket1")).toEqual(githubLight.tokens.punctuation);
    expect(resolveStyle(githubLight, "plain")).toEqual({ color: githubLight.foreground });
  });

  it("fall back to the default theme for unknown ids", () => {
    expect(getTheme("nope").id).toBe("dark-plus");
  });
});
