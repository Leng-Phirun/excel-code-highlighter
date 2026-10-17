import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals } from "../signals";
import type { Language, TokenType } from "../types";

const words = (list: string): Set<string> => new Set(list.toLowerCase().split(/\s+/).filter(Boolean));

// VBA, VB6 and VB.NET; all keywords are case-insensitive.
const CONTROL = words(`
  if then else elseif end for each next to step while wend do loop until exit select case with
  goto gosub return on error resume call stop try catch finally throw using imports namespace
  continue raiseevent
`);
const STORAGE = words(`
  sub function property get let set dim redim preserve const public private friend protected
  global static option explicit compare base type enum declare lib alias class module structure
  interface implements inherits overrides overridable mustoverride shared readonly withevents
  event handles byval byref optional paramarray as new erase async await
`);
const KEYWORD = words("and or not xor mod is isnot like andalso orelse typeof eqv imp");
const CONSTANTS = words(`
  true false nothing empty null vbcrlf vbcr vblf vbnewline vbtab vbnullstring vbyes vbno vbok
  vbcancel vbokonly vbyesno vbinformation vbexclamation vbcritical vbquestion xlup xldown
  xltoleft xltoright xlvalues xlformulas
`);
const SELF = words("me mybase myclass");
const TYPES = words(`
  integer long longlong longptr single double currency decimal string boolean date variant object
  byte char short range worksheet workbook collection dictionary chart shape
`);
const BUILTINS = words(`
  msgbox inputbox debug print range cells rows columns worksheets sheets activesheet activecell
  activeworkbook thisworkbook application selection len left right mid trim ltrim rtrim ucase
  lcase instr instrrev replace split join cstr cint clng cdbl cdate cbool format now date time
  year month day hour minute second dateadd datediff isempty isnull isnumeric isdate isarray
  isobject val chr asc array ubound lbound rgb doevents round abs int fix sqr rnd randomize
  createobject getobject dir kill filecopy shell environ worksheetfunction
`);

const REM = /rem(?=[ \t\r\n]|$)/iy;
const DIRECTIVE = /#(?:if|else|elseif|end if|const)\b/iy;
const DATE = /#\d{1,4}[/-]\d{1,2}[/-]\d{1,4}(?:[ \t]+\d{1,2}:\d{2}(?::\d{2})?(?:[ \t]*[AaPp][Mm])?)?#/y;
const NUMBER = /&[Hh][0-9A-Fa-f]+&?|&[Oo][0-7]+&?|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[%&!#@^]?/y;
const IDENT = /[A-Za-z_][\w]*[%&!#@$]?/y;
const CONTINUATION = /[ \t]_(?=\r?\n)/y;
const OPERATOR = /<>|<=|>=|:=|[-+*/\\^&=<>]/y;
const CALL = /[ \t]*\(/y;

class VbLexer extends Scanner {
  private lineStart = true;

  protected step(): void {
    const ch = this.src[this.pos];
    const newline = this.match(NEWLINE);
    if (newline) {
      this.emit("plain", newline, false);
      this.pos += newline.length;
      this.lineStart = true;
      return;
    }
    if (this.eat(CONTINUATION, "plain", false) || this.eat(SPACE, "plain", false)) return;
    if (ch === "'" || (this.lineStart && this.match(REM))) return this.lineComment();
    if (ch === "#" && this.lineStart && this.eat(DIRECTIVE, "control")) return;
    this.lineStart = false;

    if (ch === '"') return this.lexDelimited({ open: '"', close: '"', doubledClose: true });
    if ((ch === "#" && this.eat(DATE, "number")) || this.eat(NUMBER, "number")) return;
    const ident = this.match(IDENT);
    if (ident) {
      this.pos += ident.length;
      this.emit(this.classify(ident), ident);
      return;
    }
    if (ch === "(" || ch === "[" || ch === "{") return this.openBracket();
    if (ch === ")" || ch === "]" || ch === "}") return this.closeBracket();
    if (this.eat(OPERATOR, "operator")) return;
    if (ch === ":") {
      this.emit("punctuation", ch);
      this.pos++;
      this.lineStart = true; // statement separator
      return;
    }
    if (ch === "." || ch === "," || ch === ";") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    this.other();
  }

  private classify(ident: string): TokenType {
    const word = ident.toLowerCase().replace(/[%&!#@$]$/, "");
    const prev = this.prev;
    CALL.lastIndex = this.pos;
    const call = CALL.test(this.src);
    if (prev && prev.text === ".") return call ? "function" : "variable";
    if (prev && prev.type === "storage" && /^(?:sub|function|get|let|set)$/i.test(prev.text) && !STORAGE.has(word)) {
      return "function";
    }
    if (CONTROL.has(word)) return "control";
    if (STORAGE.has(word)) return "storage";
    if (KEYWORD.has(word)) return "keyword";
    if (CONSTANTS.has(word)) return "constant";
    if (SELF.has(word)) return "self";
    if (TYPES.has(word)) return "type";
    if (BUILTINS.has(word)) return "builtin";
    return call ? "function" : "variable";
  }
}

export const vb: Language = {
  id: "vb",
  name: "VBA / Visual Basic",
  tokenize: (source) => new VbLexer(source).run(),
  score: (source) =>
    scoreSignals(source, [
      // Case-sensitive on purpose: the VBA editor capitalises keywords, and "dim the lights" is a note.
      { weight: 5, pattern: /^[ \t]*(?:(?:Public|Private|Friend)\s+)?(?:Sub|Function)\s+\w+\s*\(/m },
      { weight: 4, pattern: /^[ \t]*End\s+(?:Sub|Function|If|With|Select|Property|Type)\b/m },
      { weight: 4, pattern: /^[ \t]*Dim\s+\w+(?:\s*\([^)]*\))?\s+As\s+(?:New\s+)?\w+/m },
      { weight: 5, pattern: /^[ \t]*Option\s+Explicit\b/m },
      { weight: 4, pattern: /\bMsgBox\b|\bDebug\.Print\b|\bActiveSheet\b|\bThisWorkbook\b/ },
      { weight: 2, pattern: /\b(?:Range|Cells|Worksheets|Sheets)\(/ },
      { weight: 2, pattern: /\bThen[ \t]*$/m },
      { weight: 2, pattern: /^[ \t]*Set\s+\w+\s*=/m },
      { weight: 2, pattern: /^[ \t]*Next(?:\s+\w+)?[ \t]*$/m },
      { weight: 1, pattern: /^[ \t]*'/m },
    ]),
  sample: `Option Explicit

' Colour negative values red in the selected range
Public Sub MarkNegatives()
    Dim cell As Range
    For Each cell In Selection.Cells
        If IsNumeric(cell.Value) And cell.Value < 0 Then
            cell.Font.Color = RGB(200, 0, 0)
        End If
    Next cell
    MsgBox "Done: " & Selection.Count & " cells checked"
End Sub`,
};
