import { scoreSignals } from "../signals";
import { define } from "./engine";

/* Scripting and configuration languages built on the shared engine. */

// ---------------------------------------------------------------- PHP

export const php = define({
  id: "php",
  name: "PHP",
  control:
    "if else elseif endif foreach endforeach for endfor while endwhile do switch endswitch case default break continue return try catch finally throw require require_once include include_once use namespace match yield goto declare",
  keyword: "new instanceof as and or xor clone insteadof",
  storage: "function fn class interface trait enum extends implements abstract final static public private protected const var readonly",
  types: "int float string bool array object callable iterable void mixed never",
  constants: "true false null TRUE FALSE NULL PHP_EOL __DIR__ __FILE__ __LINE__ __CLASS__ __FUNCTION__",
  self: "$this self parent",
  builtins:
    "echo print isset empty unset list count strlen strtolower strtoupper trim str_replace explode implode sprintf printf json_encode json_decode var_dump print_r die exit in_array array_map array_filter array_keys array_values preg_match preg_replace file_get_contents date time",
  functionDecl: "function fn",
  typeDecl: "class interface trait enum extends implements",
  features: {
    lineComments: ["//", "#"],
    phpTags: true,
    sigils: /\$\$?[A-Za-z_]\w*/y,
    singleQuoteStrings: true,
    multilineStrings: true,
    interpolation: { quotes: '"', variables: true },
    heredocs: true,
    capitalizedTypes: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 10, pattern: /<\?php\b/ },
      { weight: 6, pattern: /\$this->\w/ },
      { weight: 6, pattern: /\bforeach\s*\(\s*\$\w+\s+as\s+\$\w+/ },
      { weight: 5, pattern: /\bfunction\s+\w+\s*\([^)]*\$\w+/ },
      { weight: 5, pattern: /^[ \t]*namespace\s+[\w\\]+;/m },
      { weight: 4, pattern: /\$_(?:GET|POST|SERVER|SESSION|COOKIE|REQUEST)\b|\barray\s*\(/ },
      { weight: 2, pattern: /\$\w+\s*=[^=]/ },
      { weight: 2, pattern: /\becho\s+["'$]/ },
      { weight: 1, pattern: /->\w+\(/ },
    ]),
  sample: `<?php
namespace App\\Http;

function slugify(string $title): string {
    $slug = strtolower(trim($title));
    return preg_replace('/[^a-z0-9]+/', '-', $slug);
}

foreach (['Hello World', 'PHP 8.3'] as $t) {
    echo "Slug for $t: " . slugify($t) . PHP_EOL;
}`,
});

// ---------------------------------------------------------------- Ruby

export const ruby = define({
  id: "ruby",
  name: "Ruby",
  control:
    "if elsif else unless case when while until for in do end return yield begin rescue ensure raise next break redo retry then require require_relative include extend",
  keyword: "and or not defined?",
  storage: "def class module attr_accessor attr_reader attr_writer private protected public alias lambda proc",
  constants: "true false nil __FILE__ __LINE__ __method__",
  self: "self super",
  builtins: "puts print p pp format sprintf gets sleep rand loop catch throw",
  functionDecl: "def",
  typeDecl: "class module",
  features: {
    lineComments: ["#"],
    blockComments: [],
    rubyBlockComments: true,
    sigils: /@@?[A-Za-z_]\w*|\$(?:[A-Za-z_]\w*|[0-9!@&~?$])/y,
    symbols: true,
    predicateNames: true,
    singleQuoteStrings: true,
    multilineStrings: true,
    backtickStrings: true,
    interpolation: { quotes: '"`', open: "#{", close: "}" },
    heredocs: true,
    regex: true,
    capitalizedTypes: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 4, pattern: /^[ \t]*def\s+(?:self\.)?\w+[?!=]?(?:\(.*\))?[ \t]*$/m },
      { weight: 1, pattern: /^[ \t]*end[ \t]*$/m },
      { weight: 4, pattern: /^[ \t]*puts\s+["':@\d[]/m },
      { weight: 5, pattern: /\bdo\s*\|\s*\w+(?:\s*,\s*\w+)*\s*\||\{\s*\|\s*\w+(?:\s*,\s*\w+)*\s*\|/ },
      { weight: 6, pattern: /\battr_(?:accessor|reader|writer)\s+:/ },
      { weight: 3, pattern: /^[ \t]*require(?:_relative)?\s+['"]/m },
      { weight: 3, pattern: /"[^"\n]*#\{[^}\n]+\}[^"\n]*"/ },
      { weight: 5, pattern: /^[ \t]*class\s+\w+\s*<\s*[\w:]+[ \t]*$/m },
      { weight: 4, pattern: /\b(?:unless|elsif)\b/ },
      { weight: 2, pattern: /^[ \t]*@\w+\s*=/m },
      { weight: 2, pattern: /:\w+\s*=>|\.each(?:_with_index)?\b/ },
    ]),
  sample: `require 'date'

class Invoice < ApplicationRecord
  attr_reader :items

  def total
    items.sum { |i| i[:price] * i[:qty] }
  end

  def overdue?
    due_on < Date.today && !paid
  end
end
puts "Total: #{Invoice.new.total}"`,
});

// ---------------------------------------------------------------- Lua

export const lua = define({
  id: "lua",
  name: "Lua",
  control: "if then elseif else end for in do while repeat until return break goto",
  keyword: "and or not",
  storage: "local function",
  constants: "nil true false",
  self: "self",
  builtins:
    "print pairs ipairs tostring tonumber type require error assert pcall xpcall select setmetatable getmetatable rawget rawset next unpack table string math os io coroutine",
  functionDecl: "function",
  features: {
    lineComments: ["--"],
    blockComments: [],
    luaLongBrackets: true,
    colonMethods: true,
    singleQuoteStrings: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 4, pattern: /\blocal\s+(?:function\s+[\w.:]+\s*\(|[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*=)/ },
      { weight: 5, pattern: /\b(?:i?pairs)\s*\(/ },
      { weight: 4, pattern: /~=/ },
      { weight: 4, pattern: /--\[=*\[/ },
      { weight: 3, pattern: /^[ \t]*function\s+[\w.:]+\s*\([^)]*\)[ \t]*$/m },
      { weight: 2, pattern: /\bthen[ \t]*$/m },
      { weight: 2, pattern: /\w:\w+\s*\(/ },
      { weight: 1, pattern: /\.\.\s*["'\w]/ },
      { weight: 1, pattern: /^[ \t]*end[ \t]*$/m },
    ]),
  sample: `-- Count words in a string
local function count_words(text)
  local counts = {}
  for word in text:gmatch("%a+") do
    counts[word] = (counts[word] or 0) + 1
  end
  return counts
end

for w, n in pairs(count_words("the cat and the hat")) do
  print(w .. ": " .. n)
end`,
});

// ---------------------------------------------------------------- R

export const r = define({
  id: "r",
  name: "R",
  control: "if else for while repeat break next return in",
  storage: "function",
  constants: "TRUE FALSE NULL NA NaN Inf NA_integer_ NA_real_ NA_character_",
  builtins:
    "library require c list vector matrix data.frame print cat paste paste0 length sum mean median sd min max nrow ncol head tail summary str apply sapply lapply seq rep is.na which subset merge read.csv write.csv names colnames factor levels table unique sort order round abs sqrt exp log ifelse stop warning tryCatch ggplot aes mutate select filter summarise group_by arrange",
  features: {
    lineComments: ["#"],
    blockComments: [],
    dottedNames: true,
    percentOperators: true,
    singleQuoteStrings: true,
    multilineStrings: true,
    rawBackticks: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 3, pattern: /\w\s*<<?-\s*[\w("'c]/ },
      { weight: 6, pattern: /^[ \t]*library\(\w+\)/m },
      { weight: 4, pattern: /%>%|%in%|\|>/ },
      { weight: 5, pattern: /<-\s*function\s*\(/ },
      { weight: 3, pattern: /\bc\(\s*[-\d"']/ },
      { weight: 5, pattern: /\b(?:data\.frame|read\.csv|ggplot|is\.na|group_by|summarise)\(/ },
      { weight: 1, pattern: /\b(?:TRUE|FALSE|NA)\b/ },
    ]),
  sample: `library(dplyr)

# Average price by category
sales <- read.csv("sales.csv")
by_cat <- sales %>%
  filter(!is.na(price)) %>%
  group_by(category) %>%
  summarise(avg = mean(price), n = n())
print(by_cat)`,
});

// ---------------------------------------------------------------- Terraform / HCL

export const terraform = define({
  id: "terraform",
  name: "Terraform / HCL",
  control: "for in if",
  storage: "resource data variable output locals module provider terraform backend dynamic",
  types: "string number bool list map set object tuple any",
  constants: "true false null",
  self: "var local each count self path",
  builtins:
    "length lookup merge concat element file templatefile jsonencode jsondecode yamlencode format join split toset tolist tomap try can coalesce cidrsubnet replace lower upper",
  features: {
    lineComments: ["#", "//"],
    interpolation: { quotes: '"', open: "${", close: "}" },
    heredocs: true,
    assignmentKeys: true,
  },
  score: (s) =>
    scoreSignals(s, [
      { weight: 7, pattern: /^[ \t]*(?:resource|data|module|variable|output|provider)\s+"[^"\n]+"(?:\s+"[^"\n]+")?\s*\{/m },
      { weight: 6, pattern: /^[ \t]*(?:terraform|locals|required_providers)\s*\{/m },
      { weight: 5, pattern: /\$\{(?:var|local|module|data)\.\w/ },
      { weight: 2, pattern: /=\s*(?:var|local)\.\w/ },
    ]),
  sample: `terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# Bucket for application logs
resource "aws_s3_bucket" "logs" {
  bucket = "\${var.prefix}-logs"
  tags = {
    Environment = var.env
  }
}`,
});
