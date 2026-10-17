/** What a piece of source text is, for colouring. Themes map each type to a style. */
export type TokenType =
  | "plain"
  | "variable"
  | "keyword" // operator words: and, in, instanceof, -eq, ...
  | "storage" // declarations: def, class, function, let, struct, ...
  | "control" // flow and imports: if, for, return, import, #include, ...
  | "constant" // true, None, null, ...
  | "constantVar" // ALL_CAPS names
  | "self" // self, this, super
  | "builtin" // print, len, echo, console, ...
  | "type" // int, str, string, ValueError, ...
  | "function" // function names, calls, shell commands, cmdlets
  | "class"
  | "decorator" // @decorator, #[attribute]
  | "string"
  | "escape" // \n, &amp;, {{
  | "interpolation" // f"{", "${", "$(" ... and f-string format specs
  | "regex"
  | "comment"
  | "number"
  | "operator"
  | "punctuation"
  | "property" // JSON/YAML keys, CSS properties
  | "attribute" // HTML attributes, command-line flags, PowerShell parameters
  | "tag" // HTML/XML tag names
  | "selector" // CSS selectors
  | "heading" // Markdown headings
  | "strong" // **bold**
  | "emphasis" // *italic*
  | "link" // link text and URLs
  | "inserted" // + lines in a diff
  | "deleted" // - lines in a diff
  | "bracket0"
  | "bracket1"
  | "bracket2";

export interface Token {
  type: TokenType;
  text: string;
}

export interface Language {
  id: string;
  name: string;
  /**
   * Splits source into tokens. The tokens' text must always concatenate back
   * to the exact input, whatever it is (partial, malformed, another language):
   * Excel requires a cell's rich-text runs to spell out its value exactly.
   */
  tokenize(source: string): Token[];
  /** Evidence that `source` is in this language; 0 means none. See CODE_THRESHOLD. */
  score(source: string): number;
  /** A short snippet for the theme preview. */
  sample: string;
}
