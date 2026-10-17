import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language, TokenType } from "../types";

const words = (list: string): Set<string> => new Set(list.trim().split(/\s+/));

// ANSI SQL plus the common words of PostgreSQL, MySQL, SQL Server, SQLite and Oracle.
const KEYWORDS = words(`
  ADD AFTER ALL ALTER AND ANY AS ASC AUTO_INCREMENT BEFORE BEGIN BETWEEN BY CASCADE CASE CATCH
  CHECK CLUSTERED COLLATE COLUMN COMMIT CONFLICT CONSTRAINT CREATE CROSS DATABASE DECLARE DEFAULT
  DELETE DESC DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT EXEC EXECUTE EXISTS FETCH FILTER FIRST
  FOR FOREIGN FROM FULL FUNCTION GO GRANT GROUP HAVING IDENTITY IF ILIKE IN INCLUDE INDEX INNER
  INSERT INSTEAD INTERSECT INTO IS JOIN KEY LAST LATERAL LEFT LIKE LIMIT LOOP MATCHED MERGE MINUS
  NATURAL NEXT NONCLUSTERED NOT NOTHING NULLS OF OFFSET ON ONLY OR ORDER OUTER OUTPUT OVER
  PARTITION PRIMARY PRINT PROCEDURE RAISERROR RECURSIVE REFERENCES RENAME REPLACE RETURN RETURNING
  RETURNS REVOKE RIGHT ROLLBACK ROW ROWS SCHEMA SELECT SET SOME TABLE THEN TO TOP TRANSACTION
  TRIGGER TRUNCATE TRY UNION UNIQUE UPDATE USE USING VALUES VIEW WHEN WHERE WHILE WINDOW WITH
`);
const TYPES = words(`
  ARRAY BIGINT BIGSERIAL BINARY BIT BLOB BOOL BOOLEAN BYTEA CHAR CHARACTER CLOB DATE DATETIME
  DATETIME2 DECIMAL DOUBLE FLOAT INT INTEGER INTERVAL JSON JSONB MONEY NCHAR NTEXT NUMBER NUMERIC
  NVARCHAR PRECISION REAL SERIAL SMALLINT TEXT TIME TIMESTAMP TIMESTAMPTZ TINYINT UNIQUEIDENTIFIER
  UUID VARBINARY VARCHAR VARCHAR2 XML
`);
const FUNCTIONS = words(`
  ABS AVG CAST CEIL CEILING COALESCE CONCAT CONVERT COUNT CURRENT_DATE CURRENT_TIMESTAMP DATEADD
  DATEDIFF DATE_TRUNC DENSE_RANK EXTRACT FLOOR GETDATE GROUP_CONCAT IFNULL ISNULL LAG LEAD LEN
  LENGTH LOWER LTRIM MAX MIN NOW NULLIF NVL RANK REPLACE ROUND ROW_NUMBER RTRIM STRING_AGG SUBSTR
  SUBSTRING SUM TO_CHAR TO_DATE TRIM UPPER
`);
const CONSTANTS = words("NULL TRUE FALSE UNKNOWN");

const IDENT = /[A-Za-z_][\w$]*/y;
const TEMP_TABLE = /#{1,2}[A-Za-z_]\w*/y;
const PARAMETER = /@@?[A-Za-z_]\w*|:[A-Za-z_]\w*|\$\d+|\?/y;
const NUMBER = /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const OPERATOR = /::|\|\||<>|!=|<=|>=|->>?|[-+*/%=<>~!&|^]/y;
const STRING_PREFIX = /[NnEeXxBbUu]&?'/y;
const BRACKETED_NAME = /\[[^\]\r\n[]{1,128}\]/y;
const CALL = /[ \t]*\(/y;

class SqlLexer extends Scanner {
  protected step(): void {
    const ch = this.src[this.pos];
    if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) return;
    if (this.at("--")) return this.lineComment();
    if (this.at("/*")) return this.lexDelimited({ open: "/*", close: "*/", type: "comment", multiline: true });

    const prefixed = this.match(STRING_PREFIX);
    if (prefixed || ch === "'") {
      const open = prefixed ?? "'";
      return this.lexDelimited({ open, close: "'", multiline: true, doubledClose: true, escape: open.startsWith("E") || open.startsWith("e") ? /\\./uy : undefined });
    }
    if (ch === '"') return this.lexDelimited({ open: '"', close: '"', type: "variable", multiline: true, doubledClose: true });
    if (ch === "`") return this.lexDelimited({ open: "`", close: "`", type: "variable", doubledClose: true });
    // T-SQL [quoted names], but not array subscripts like arr[1].
    if (ch === "[" && !/[\w\])]/.test(this.src.charAt(this.pos - 1)) && this.eat(BRACKETED_NAME, "variable")) return;
    if (this.eat(TEMP_TABLE, "variable") || this.eat(PARAMETER, "variable")) return;

    const word = this.match(IDENT);
    if (word) {
      this.pos += word.length;
      this.emit(this.classify(word), word);
      return;
    }
    if (this.eat(NUMBER, "number")) return;
    if (ch === "(" || ch === "[") return this.openBracket();
    if (ch === ")" || ch === "]") return this.closeBracket();
    if (this.eat(OPERATOR, "operator")) return;
    if (ch === "," || ch === "." || ch === ";") {
      this.emit("punctuation", ch);
      this.pos++;
      return;
    }
    this.other();
  }

  private classify(word: string): TokenType {
    const upper = word.toUpperCase();
    const prev = this.prev;
    if (prev && prev.text === ".") return "plain"; // schema.table.column
    // INSERT INTO orders (id, ...): a table name, not a function call.
    if (prev && prev.type === "keyword" && /^(?:INTO|TABLE|JOIN|FROM|UPDATE)$/i.test(prev.text)) return "plain";
    CALL.lastIndex = this.pos;
    const call = CALL.test(this.src);
    if (CONSTANTS.has(upper)) return "constant";
    if (FUNCTIONS.has(upper) && call) return "function";
    if (KEYWORDS.has(upper)) return "keyword";
    if (TYPES.has(upper)) return "type";
    if (call) return "function";
    return "plain";
  }
}

const SIGNALS: Signal[] = [
  { weight: 5, pattern: /\bSELECT\b[\s\S]+?\bFROM\b/ },
  { weight: 4, pattern: /\bselect\s+(?:\*|distinct\b|\w+\s*\(|[\w.]+\s*,)[\s\S]*?\bfrom\b/i },
  // Statement words count only with statement shape: "Insert into Q3 report" is a note.
  { weight: 5, pattern: /\binsert\s+into\s+[\w.[\]"`]+\s*(?:\(|values\b|select\b)/i },
  { weight: 5, pattern: /\bdelete\s+from\s+[\w.[\]"`]+[ \t]*(?:where\b|;|$)/im },
  { weight: 5, pattern: /\bupdate\s+[\w.[\]"`]+\s+set\s+[\w.[\]"`]+\s*=/i },
  {
    weight: 5,
    pattern:
      /\bcreate\s+(?:or\s+replace\s+)?(?:table|view|index|database|schema|procedure|function|trigger)\s+(?:if\s+not\s+exists\s+)?[\w.[\]"`]+[ \t]*(?:\(|as\b|on\b|;|$)/im,
  },
  { weight: 5, pattern: /\balter\s+table\s+[\w.[\]"`]+\s+(?:add|drop|alter|rename)\b|\bdrop\s+(?:table|view|index|database|schema)\s+(?:if\s+exists\s+)?[\w.[\]"`]+[ \t]*(?:;|$)/im },
  { weight: 2, pattern: /\b(?:WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|INNER\s+JOIN|LEFT\s+JOIN|LIMIT)\b/ },
  { weight: 1, pattern: /\b(?:where|group\s+by|order\s+by|inner\s+join|left\s+join)\b/ },
  { weight: 1, pattern: /^[ \t]*--\s/m },
  { weight: 1, pattern: /;[ \t]*$/m },
];

export const sql: Language = {
  id: "sql",
  name: "SQL",
  tokenize: (source) => new SqlLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `-- Top customers by revenue this year
SELECT c.name, COUNT(o.id) AS orders, SUM(o.total) AS revenue
FROM customers AS c
INNER JOIN orders AS o ON o.customer_id = c.id
WHERE o.created_at >= '2026-01-01' AND o.status <> 'cancelled'
GROUP BY c.name
HAVING SUM(o.total) > 1000
ORDER BY revenue DESC
LIMIT 10;`,
};
