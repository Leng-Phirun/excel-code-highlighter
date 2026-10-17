import { scoreSignals, type Signal } from "../signals";
import { define, type Features } from "./engine";

/* The brace-and-semicolon family, built on the shared engine. */

// ---------------------------------------------------------------- JavaScript / TypeScript

const JS_SIGNALS: Signal[] = [
  { weight: 4, pattern: /\bconsole\.(?:log|error|warn|info|table)\s*\(/ },
  { weight: 4, pattern: /^[ \t]*import\s+(?:[\w*{}\s,]+\s+from\s+)?["'][^"']+["'];?[ \t]*$/m },
  { weight: 4, pattern: /^[ \t]*export\s+(?:default|const|let|function|class|async|\{)/m },
  { weight: 3, pattern: /\bfunction\s*\*?\s*[\w$]*\s*\([^)]*\)\s*\{/ },
  { weight: 2, pattern: /\b(?:const|let|var)\s+[\w${}[\],\s]+=/ },
  { weight: 2, pattern: /=>\s*[{(\w"'`]/ },
  { weight: 3, pattern: /\b(?:document|window)\.(?:getElementById|querySelector(?:All)?|createElement|addEventListener|body|cookie|location|innerWidth|innerHeight|localStorage|sessionStorage|onload)\b|\brequire\(\s*["']/ },
  { weight: 2, pattern: /===|!==/ },
  { weight: 1, pattern: /\b(?:undefined|null)\b/ },
  { weight: 1, pattern: /;[ \t]*$/m },
  { weight: 2, pattern: /`[^`]*\$\{[^}]+\}[^`]*`/ },
  { weight: 2, pattern: /\basync\s+(?:function|\()|\bawait\s+[\w.]+\(/ },
];
const TS_SIGNALS: Signal[] = [
  { weight: 3, pattern: /[\w)?]\s*:\s*(?:string|number|boolean|any|unknown|never|void)(?:\[\])?\s*[,;=)|{]/ },
  { weight: 4, pattern: /^[ \t]*(?:export\s+)?interface\s+[A-Z]\w*(?:<[^>]*>)?\s*(?:extends\s+[\w<>,\s]+)?\{/m },
  { weight: 3, pattern: /^[ \t]*(?:export\s+)?type\s+[A-Z]\w*(?:<[^>]*>)?\s*=/m },
  { weight: 2, pattern: /\bas\s+(?:const|string|number|unknown|any)\b/ },
  { weight: 2, pattern: /\b(?:public|private|protected|readonly)\s+\w+\s*[:;=(]/ },
  { weight: 2, pattern: /\):\s*(?:Promise<|void\b|string\b|number\b|boolean\b)/ },
];

const JS_WORDS = {
  control:
    "if else for while do switch case default break continue return throw try catch finally import export from as await yield with debugger",
  keyword: "in of instanceof typeof delete void new",
  storage: "var let const function class extends static get set async",
  types:
    "Object Array String Number Boolean Symbol BigInt Promise Map Set WeakMap WeakSet Date RegExp Error TypeError RangeError SyntaxError JSON Math Reflect Proxy Intl ArrayBuffer Uint8Array",
  constants: "true false null undefined NaN Infinity",
  self: "this super arguments",
  builtins:
    "console require module exports globalThis window document process parseInt parseFloat isNaN isFinite setTimeout setInterval clearTimeout clearInterval fetch alert structuredClone queueMicrotask",
  functionDecl: "function",
  typeDecl: "class extends",
};
const JS_FEATURES: Partial<Features> = {
  annotations: true,
  regex: true,
  backtickStrings: true,
  interpolation: { quotes: "`", open: "${", close: "}" },
  singleQuoteStrings: true,
  capitalizedTypes: true,
  dollarIdentifiers: true,
};

export const javascript = define({
  id: "javascript",
  name: "JavaScript",
  ...JS_WORDS,
  features: JS_FEATURES,
  score: (s) => scoreSignals(s, JS_SIGNALS),
  sample: `// Run fn only after \`wait\` ms without another call
export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}
const onResize = debounce(() => console.log(\`width: \${window.innerWidth}px\`));
window.addEventListener("resize", onResize);`,
});

export const typescript = define({
  id: "typescript",
  name: "TypeScript",
  ...JS_WORDS,
  storage: `${JS_WORDS.storage} interface type enum namespace module declare abstract implements readonly private protected public keyof infer is asserts satisfies override accessor unique`,
  types: `${JS_WORDS.types} string number boolean any unknown never void object symbol bigint Record Partial Readonly Pick Omit Required ReturnType Awaited`,
  typeDecl: `${JS_WORDS.typeDecl} interface type enum implements namespace`,
  features: JS_FEATURES,
  // Only claims code that shows TypeScript-specific syntax; plain JS goes to JavaScript.
  score: (s) => {
    const extra = scoreSignals(s, TS_SIGNALS);
    return extra ? extra + scoreSignals(s, JS_SIGNALS) : 0;
  },
  sample: `interface User {
  id: number;
  name: string;
  email?: string;
}

export async function fetchUsers(url: string): Promise<User[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return (await res.json()) as User[];
}`,
});

// ---------------------------------------------------------------- Java

export const java = define({
  id: "java",
  name: "Java",
  control: "if else for while do switch case default break continue return throw try catch finally import package yield assert",
  keyword: "new instanceof",
  storage:
    "class interface enum record extends implements public private protected static final abstract native transient volatile synchronized strictfp throws var sealed permits",
  types:
    "boolean byte char short int long float double void String Object Integer Long Double Float Boolean Character Byte Short List ArrayList LinkedList Map HashMap TreeMap Set HashSet Optional Stream Exception RuntimeException Thread",
  constants: "true false null",
  self: "this super",
  typeDecl: "class interface enum record extends implements throws",
  features: { annotations: true, charLiterals: true, tripleQuotes: ['"""'], capitalizedTypes: true },
  score: (s) =>
    scoreSignals(s, [
      { weight: 5, pattern: /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\]/ },
      { weight: 5, pattern: /\bSystem\.(?:out|err)\.print(?:ln|f)?\s*\(/ },
      { weight: 5, pattern: /^[ \t]*import\s+(?:static\s+)?javax?\.[\w.*]+;/m },
      { weight: 4, pattern: /^[ \t]*package\s+[\w.]+;/m },
      { weight: 3, pattern: /@(?:Override|Autowired|Test|Entity|Service|RestController|GetMapping|PostMapping)\b/ },
      { weight: 2, pattern: /\b(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:class|void|int|String|boolean|List<)/ },
      { weight: 2, pattern: /\bnew\s+[A-Z]\w*(?:<[^>]*>)?\s*\(/ },
      { weight: 2, pattern: /\bString\s+\w+\s*=/ },
      { weight: 1, pattern: /;[ \t]*$/m },
    ]),
  sample: `import java.util.*;

public class WordCount {
    public static void main(String[] args) {
        Map<String, Integer> counts = new HashMap<>();
        for (String word : "the cat and the hat".split(" ")) {
            counts.merge(word, 1, Integer::sum);
        }
        System.out.println(counts); // {the=2, cat=1, ...}
    }
}`,
});

// ---------------------------------------------------------------- C#

export const csharp = define({
  id: "csharp",
  name: "C#",
  control: "if else for foreach while do switch case default break continue return throw try catch finally goto using yield await lock when",
  keyword:
    "new is as in out ref typeof sizeof nameof checked unchecked stackalloc where select from orderby group into join let on equals by ascending descending",
  storage:
    "class struct interface enum record namespace public private protected internal static readonly const sealed abstract virtual override async partial extern unsafe volatile event delegate implicit explicit operator params get set init var dynamic required",
  types:
    "bool byte sbyte char decimal double float int uint long ulong short ushort object string void nint nuint String Int32 Int64 Boolean List Dictionary HashSet Task IEnumerable IList Exception DateTime TimeSpan Guid",
  constants: "true false null",
  self: "this base",
  typeDecl: "class struct interface enum record namespace",
  features: {
    preprocessor: true,
    charLiterals: true,
    tripleQuotes: ['"""'],
    csharpStrings: true,
    capitalizedTypes: true,
    pascalMethods: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 5, pattern: /^[ \t]*using\s+System(?:\.[\w.]+)?;/m },
      { weight: 5, pattern: /\bConsole\.Write(?:Line)?\s*\(/ },
      { weight: 4, pattern: /\bstatic\s+(?:async\s+)?(?:void|Task|int)\s+Main\s*\(/ },
      { weight: 3, pattern: /^[ \t]*namespace\s+[\w.]+\s*[;{]?[ \t]*$/m },
      { weight: 4, pattern: /\{\s*get;\s*(?:private\s+set;|init;|set;)?\s*\}/ },
      { weight: 2, pattern: /\b(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:void|Task|string|int|bool|var)\b/ },
      { weight: 2, pattern: /\bvar\s+\w+\s*=\s*new\b/ },
      { weight: 2, pattern: /\$"[^"\n]*\{[^}\n]+\}/ },
      { weight: 3, pattern: /^[ \t]*\[(?:HttpGet|HttpPost|Fact|Test|Serializable|ApiController|Route)(?:\([^)\n]*\))?\][ \t]*$/m },
      { weight: 1, pattern: /;[ \t]*$/m },
    ]),
  sample: `using System.Linq;

public record Order(int Id, decimal Total);

public static class Report
{
    public static void Print(IEnumerable<Order> orders)
    {
        var big = orders.Where(o => o.Total > 100m).ToList();
        Console.WriteLine($"{big.Count} large orders, {big.Sum(o => o.Total):C}");
    }
}`,
});

// ---------------------------------------------------------------- C / C++

const C_WORDS = {
  control: "if else for while do switch case default break continue return goto",
  keyword: "sizeof _Alignof _Generic",
  storage: "struct union enum typedef static extern const volatile register inline auto restrict signed unsigned _Atomic _Thread_local",
  types:
    "void char short int long float double _Bool bool size_t ssize_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t intptr_t uintptr_t ptrdiff_t wchar_t FILE",
  builtins:
    "printf fprintf sprintf snprintf scanf sscanf malloc calloc realloc free memcpy memset memmove memcmp strlen strcpy strncpy strcmp strncmp strcat strchr strstr strtol fopen fclose fread fwrite fgets fputs puts putchar getchar exit abort assert atoi atof qsort",
};

export const c = define({
  id: "c",
  name: "C",
  ...C_WORDS,
  constants: "NULL true false EOF stdin stdout stderr EXIT_SUCCESS EXIT_FAILURE",
  typeDecl: "struct union enum",
  features: { preprocessor: true, charLiterals: true, cPrefixes: true },
  score: (s) =>
    scoreSignals(s, [
      { weight: 5, pattern: /#include\s*<(?:stdio|stdlib|string|math|unistd|stdint|stdbool|ctype|time|errno|signal|pthread)\.h>/ },
      { weight: 4, pattern: /\bint\s+main\s*\(\s*(?:void|int\s+argc[^)]*)?\s*\)/ },
      { weight: 3, pattern: /\b(?:printf|fprintf|scanf|malloc|free|sizeof)\(/ },
      { weight: 2, pattern: /\bstruct\s+\w+\s*\{/ },
      { weight: 2, pattern: /^[ \t]*#define\s+\w+/m },
      { weight: 1, pattern: /->\w+/ },
      { weight: 1, pattern: /;[ \t]*$/m },
    ]),
  sample: `#include <stdio.h>
#include <stdlib.h>

/* Sum the numbers given on the command line */
int main(int argc, char *argv[]) {
    long total = 0;
    for (int i = 1; i < argc; i++) {
        total += strtol(argv[i], NULL, 10);
    }
    printf("total: %ld\\n", total);
    return EXIT_SUCCESS;
}`,
});

export const cpp = define({
  id: "cpp",
  name: "C++",
  control: `${C_WORDS.control} try catch throw co_await co_return co_yield`,
  keyword: `${C_WORDS.keyword} new delete typeid static_cast dynamic_cast const_cast reinterpret_cast noexcept decltype alignof operator`,
  storage: `${C_WORDS.storage} class namespace template typename public private protected virtual override final friend mutable explicit constexpr consteval constinit using concept requires export import module thread_local`,
  types: `${C_WORDS.types} string wstring string_view vector map unordered_map set unordered_set multimap list deque array pair tuple optional variant any unique_ptr shared_ptr weak_ptr function span char8_t char16_t char32_t`,
  constants: "nullptr true false NULL",
  self: "this",
  builtins: `${C_WORDS.builtins} std cout cin cerr clog endl make_unique make_shared move forward swap`,
  typeDecl: "class struct union enum namespace typename concept",
  features: { preprocessor: true, charLiterals: true, cppRaw: true, cPrefixes: true, capitalizedTypes: true },
  score: (s) =>
    scoreSignals(s, [
      { weight: 5, pattern: /#include\s*<(?:iostream|vector|string|map|unordered_map|memory|algorithm|sstream|fstream|thread|mutex|optional|array|set)>/ },
      { weight: 4, pattern: /\bstd::\w+/ },
      { weight: 4, pattern: /\b(?:cout|cerr)\s*<<|\bcin\s*>>/ },
      { weight: 3, pattern: /\btemplate\s*<\s*(?:typename|class)\b/ },
      { weight: 3, pattern: /\busing\s+namespace\s+std\b|\bnamespace\s+\w+\s*\{/ },
      { weight: 3, pattern: /\bnullptr\b/ },
      { weight: 2, pattern: /^[ \t]*(?:public|private|protected)\s*:[ \t]*$/m },
      { weight: 2, pattern: /\bint\s+main\s*\(/ },
      { weight: 1, pattern: /;[ \t]*$/m },
    ]),
  sample: `#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> scores{72, 95, 88, 61};
    std::sort(scores.begin(), scores.end(), std::greater<>());
    for (const auto& s : scores) {
        std::cout << s << (s >= 90 ? " (top)" : "") << '\\n';
    }
    return 0;
}`,
});

// ---------------------------------------------------------------- Go

export const go = define({
  id: "go",
  name: "Go",
  control: "if else for range switch case default break continue return goto fallthrough select defer go import package",
  storage: "func var const type struct interface map chan",
  types:
    "bool byte rune int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128 string error any comparable",
  constants: "true false nil iota",
  builtins: "append cap clear close complex copy delete imag len make max min new panic print println real recover",
  functionDecl: "func",
  typeDecl: "type",
  features: { charLiterals: true, rawBackticks: true, pascalMethods: true },
  score: (s) =>
    scoreSignals(s, [
      { weight: 2, pattern: /^[ \t]*package\s+\w+[ \t]*$/m },
      { weight: 4, pattern: /\bfunc\s+(?:\([^)]*\)\s*)?\w+\s*\([^)]*\)\s*(?:\(?[\w*[\].]+(?:,\s*[\w*[\].]+)*\)?\s*)?\{/ },
      { weight: 5, pattern: /\bfmt\.(?:Print|Println|Printf|Sprintf|Errorf|Fprintf)\s*\(/ },
      { weight: 5, pattern: /\bif\s+err\s*!=\s*nil\b/ },
      { weight: 2, pattern: /\w\s*:=\s*\S/ },
      { weight: 4, pattern: /^[ \t]*import\s*\([ \t]*$|^[ \t]*import\s+"[\w./-]+"[ \t]*$/m },
      { weight: 3, pattern: /\bgo\s+func\b|\bdefer\s+[\w.]+\(|\bchan\s+\w|\bmake\(\s*(?:map|chan|\[\])/ },
    ]),
  sample: `package main

import (
	"fmt"
	"os"
)

func main() {
	data, err := os.ReadFile("config.json")
	if err != nil {
		fmt.Fprintf(os.Stderr, "read failed: %v\\n", err)
		os.Exit(1)
	}
	fmt.Println(len(data), "bytes")
}`,
});

// ---------------------------------------------------------------- Rust

export const rust = define({
  id: "rust",
  name: "Rust",
  control: "if else for while loop match break continue return in use mod crate await yield",
  keyword: "as ref move unsafe where dyn",
  storage: "fn let mut const static struct enum trait impl type pub extern async union",
  types:
    "i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc RefCell Cell HashMap HashSet BTreeMap BTreeSet Self",
  constants: "true false None",
  self: "self super",
  builtins: "Some Ok Err",
  functionDecl: "fn",
  typeDecl: "struct enum trait impl type union",
  features: { charLiterals: true, rust: true, capitalizedTypes: true },
  score: (s) =>
    scoreSignals(s, [
      { weight: 4, pattern: /\bfn\s+\w+\s*(?:<[^>]*>)?\s*\(/ },
      { weight: 4, pattern: /\blet\s+mut\s+\w+/ },
      { weight: 5, pattern: /\b(?:println|format|vec|panic|eprintln|assert_eq)!\s*[([]/ },
      { weight: 3, pattern: /\bimpl(?:<[^>]*>)?\s+[\w<>:]+(?:\s+for\s+[\w<>:]+)?\s*\{/ },
      { weight: 3, pattern: /&mut\s+\w|&self\b|&'\w+/ },
      { weight: 5, pattern: /#\[(?:derive|test|cfg|allow)\b/ },
      { weight: 2, pattern: /\b(?:Some|Ok|Err)\(|\bunwrap\(\)/ },
      { weight: 2, pattern: /\buse\s+(?:std|crate|super)::/ },
      { weight: 1, pattern: /\blet\s+\w+\s*(?::\s*[\w<>&]+)?\s*=/ },
    ]),
  sample: `use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Item { name: String, qty: u32 }

/// Total quantity per item name.
fn totals(items: &[Item]) -> HashMap<&str, u32> {
    let mut map = HashMap::new();
    for item in items {
        *map.entry(item.name.as_str()).or_insert(0) += item.qty;
    }
    map
}`,
});

// ---------------------------------------------------------------- Kotlin

export const kotlin = define({
  id: "kotlin",
  name: "Kotlin",
  control: "if else when for while do return break continue throw try catch finally import package in is as",
  storage:
    "fun val var class object interface data sealed enum annotation companion abstract open override private public protected internal lateinit suspend inline reified typealias const vararg init constructor by operator infix tailrec external",
  types: "Int Long Short Byte Double Float Boolean Char String Unit Any Nothing List MutableList Map MutableMap Set Array Pair Sequence",
  constants: "true false null",
  self: "this super",
  builtins: "println print listOf mutableListOf mapOf mutableMapOf setOf arrayOf require check error TODO lazy repeat",
  functionDecl: "fun",
  typeDecl: "class interface object typealias",
  features: {
    annotations: true,
    charLiterals: true,
    tripleQuotes: ['"""'],
    interpolation: { quotes: '"', open: "${", close: "}", variables: true },
    capitalizedTypes: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 5, pattern: /\bfun\s+(?:<[^>]*>\s*)?[\w.]+\s*\(/ },
      { weight: 5, pattern: /\bdata\s+class\b|\bcompanion\s+object\b|\bsuspend\s+fun\b|\blateinit\s+var\b/ },
      { weight: 3, pattern: /\bwhen\s*(?:\([^)]*\))?\s*\{/ },
      { weight: 2, pattern: /\bval\s+\w+\s*(?::\s*[\w<>?, ]+)?\s*=/ },
      { weight: 2, pattern: /(?:^|[^.\w])println\(/m },
      { weight: 2, pattern: /\w\?\.\w|\?:\s/ },
      { weight: 3, pattern: /^[ \t]*package\s+[\w.]+\.[\w.]+[ \t]*$/m },
      { weight: 2, pattern: /\b(?:listOf|mutableListOf|mapOf|setOf)\(/ },
    ]),
  sample: `data class User(val id: Int, val name: String, val email: String? = null)

fun main() {
    val users = listOf(User(1, "Ann"), User(2, "Bo", "bo@x.io"))
    val named = users.filter { it.email != null }.map { it.name }
    when (named.size) {
        0 -> println("nobody")
        else -> println("found \${named.size}: $named")
    }
}`,
});

// ---------------------------------------------------------------- Swift

export const swift = define({
  id: "swift",
  name: "Swift",
  control:
    "if else guard switch case default for in while repeat return break continue fallthrough throw throws rethrows try catch do defer import where",
  keyword: "is as",
  storage:
    "func let var class struct enum protocol extension init deinit subscript typealias associatedtype static final override mutating nonmutating lazy weak unowned private fileprivate internal public open inout some any async await convenience required indirect actor nonisolated",
  types: "Int Double Float Bool String Character Array Dictionary Set Optional Void Any AnyObject Error Result Data Date URL",
  constants: "true false nil",
  self: "self Self super",
  builtins: "print debugPrint fatalError precondition assert min max abs zip stride",
  functionDecl: "func",
  typeDecl: "class struct enum protocol extension actor typealias",
  features: {
    preprocessor: true,
    annotations: true,
    tripleQuotes: ['"""'],
    interpolation: { quotes: '"', open: "\\(", close: ")" },
    capitalizedTypes: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 6, pattern: /^[ \t]*import\s+(?:UIKit|SwiftUI|Foundation|Combine|XCTest)[ \t]*$/m },
      { weight: 5, pattern: /\bguard\s+let\b|\bif\s+let\s+\w+\s*=/ },
      { weight: 4, pattern: /\bfunc\s+\w+\s*(?:<[^>]*>)?\([^)]*\)\s*(?:async\s+)?(?:throws\s+)?->/ },
      { weight: 4, pattern: /"[^"\n]*\\\([^)\n]+\)[^"\n]*"/ },
      { weight: 4, pattern: /@(?:State|Published|Binding|ObservedObject|objc|MainActor|escaping|IBOutlet|IBAction)\b/ },
      { weight: 5, pattern: /\bstruct\s+\w+\s*:\s*(?:View|Codable|Identifiable)\b/ },
      { weight: 2, pattern: /\b(?:let|var)\s+\w+\s*:\s*[A-Z]\w*[?!]?\s*[=\n]/ },
      { weight: 2, pattern: /\bfunc\s+\w+/ },
    ]),
  sample: `import SwiftUI

struct CounterView: View {
    @State private var count = 0

    var body: some View {
        Button("Tapped \\(count) times") { count += 1 }
            .padding()
    }
}`,
});

// ---------------------------------------------------------------- Scala

export const scala = define({
  id: "scala",
  name: "Scala",
  control: "if else match case for while do yield return throw try catch finally import package then",
  keyword: "new",
  storage:
    "def val var lazy class object trait extends with abstract sealed final implicit override private protected type given using enum",
  types: "Int Long Double Float Boolean Char String Unit Any AnyRef Nothing List Seq Vector Map Set Option Either Future Array",
  constants: "true false null None Nil",
  self: "this super",
  builtins: "println print require assert Some Left Right",
  functionDecl: "def",
  typeDecl: "class object trait type extends with",
  features: {
    annotations: true,
    charLiterals: true,
    tripleQuotes: ['"""'],
    interpolation: { quotes: '"', open: "${", close: "}", variables: true },
    capitalizedTypes: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 6, pattern: /^[ \t]*import\s+scala\./m },
      { weight: 5, pattern: /\bcase\s+class\b|\bsealed\s+trait\b|\bextends\s+App\b/ },
      { weight: 4, pattern: /\bobject\s+\w+(?:\s+extends\s+\w+)?\s*\{/ },
      { weight: 4, pattern: /\bdef\s+\w+(?:\[[^\]]*\])?(?:\([^)]*\))*\s*:\s*[\w[\], ]+\s*=/ },
      { weight: 3, pattern: /\w\s+match\s*\{/ },
      { weight: 2, pattern: /\bval\s+\w+\s*(?::\s*[\w[\]]+)?\s*=/ },
      { weight: 2, pattern: /\bs"[^"\n]*\$\{?\w/ },
    ]),
  sample: `import scala.util.Try

case class Order(id: Int, total: Double)

object Report extends App {
  def big(orders: List[Order]): List[Order] = orders.filter(_.total > 100)
  val orders = List(Order(1, 250.0), Order(2, 40.0))
  big(orders) match {
    case Nil  => println("none")
    case list => println(s"\${list.size} big orders")
  }
}`,
});

// ---------------------------------------------------------------- Dart

export const dart = define({
  id: "dart",
  name: "Dart",
  control:
    "if else for while do switch case default break continue return throw rethrow try catch finally on assert import export library part show hide deferred await yield in",
  keyword: "new is as",
  storage:
    "var final const late class extends implements with mixin enum abstract static async sync get set factory operator typedef external covariant required extension sealed base interface",
  types: "int double num String bool List Map Set Future Stream Iterable Object dynamic void Never Function Duration DateTime",
  constants: "true false null",
  self: "this super",
  builtins: "print",
  typeDecl: "class mixin enum extension extends implements with typedef",
  features: {
    annotations: true,
    singleQuoteStrings: true,
    tripleQuotes: ['"""', "'''"],
    interpolation: { quotes: "\"'", open: "${", close: "}", variables: true },
    capitalizedTypes: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 9, pattern: /^[ \t]*import\s+'(?:package|dart):/m },
      { weight: 6, pattern: /\bWidget\s+build\s*\(\s*BuildContext\b|\bStatelessWidget\b|\bStatefulWidget\b/ },
      { weight: 4, pattern: /\bvoid\s+main\s*\(\s*\)\s*(?:async\s*)?(?:\{|=>)/ },
      { weight: 4, pattern: /@override\b/ },
      { weight: 3, pattern: /\bFuture<[\w<>?]+>\s+\w+\s*\(|\)\s*async\s*\{/ },
      { weight: 3, pattern: /'[^'\n]*\$\{?[A-Za-z_]\w*[^'\n]*'/ },
      { weight: 3, pattern: /\blate\s+(?:final\s+)?\w+|\brequired\s+this\.\w+/ },
      { weight: 2, pattern: /\bfinal\s+\w+\s*=/ },
    ]),
  sample: `import 'package:flutter/material.dart';

class Greeting extends StatelessWidget {
  const Greeting({super.key, required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Text('Hello, $name! \${name.length} letters');
  }
}`,
});
