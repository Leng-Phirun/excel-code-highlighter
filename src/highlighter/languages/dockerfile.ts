import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals } from "../signals";
import type { Language } from "../types";
import { json } from "./json";
import { shell } from "./shell";

const INSTRUCTIONS = new Set([
  "FROM", "RUN", "CMD", "LABEL", "MAINTAINER", "EXPOSE", "ENV", "ADD", "COPY", "ENTRYPOINT", "VOLUME",
  "USER", "WORKDIR", "ARG", "ONBUILD", "STOPSIGNAL", "HEALTHCHECK", "SHELL",
]);
/** Instructions whose arguments are a shell command (unless written as a JSON array). */
const SHELL_FORM = new Set(["RUN", "CMD", "ENTRYPOINT"]);

const INSTRUCTION = /[A-Za-z]+(?=[ \t]|\r|\n|$)/y;
const VARIABLE = /\$\{[^}\r\n]*\}?|\$[A-Za-z_]\w*/y;
const FLAG = /--[A-Za-z][\w-]*/y;
const KEY = /[A-Za-z_][\w.-]*(?==)/y;
const NUMBER = /\d+(?:\/(?:tcp|udp))?(?=[\s:]|$)/y;
const WORD = /[^\s"'$=\\]+/y;
const ESCAPE = /\\[^\r\n]/uy;

class DockerfileLexer extends Scanner {
  /** Lexes one instruction (with its `\` continuation lines) or one comment/blank line. */
  protected step(): void {
    if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) return;
    if (this.src[this.pos] === "#") return this.lineComment();

    const word = this.match(INSTRUCTION);
    const instruction = word?.toUpperCase() ?? "";
    if (!word || !INSTRUCTIONS.has(instruction)) return this.args(this.instructionEnd(), "");

    this.emit("control", word);
    this.pos += word.length;
    const end = this.instructionEnd();
    const rest = this.src.slice(this.pos, end);
    if (SHELL_FORM.has(instruction) || (instruction === "ONBUILD" && /^[ \t]*RUN\b/i.test(rest))) {
      const lead = /^[ \t]*/.exec(rest)?.[0] ?? "";
      this.emit("plain", lead, false);
      this.pos += lead.length;
      const body = rest.slice(lead.length);
      this.embed(body.startsWith("[") ? json.tokenize(body) : shell.tokenize(body));
      return;
    }
    this.args(end, instruction);
  }

  /** End of the instruction at the current position, following `\` line continuations. */
  private instructionEnd(): number {
    const src = this.src;
    let end = this.pos;
    for (;;) {
      end += this.restOfLine(end).length;
      if (src[end - 1] !== "\\" || end >= src.length) return end;
      end += src[end] === "\r" && src[end + 1] === "\n" ? 2 : 1;
    }
  }

  private args(end: number, instruction: string): void {
    while (this.pos < end) {
      const ch = this.src[this.pos];
      if (this.eat(NEWLINE, "plain", false) || this.eat(SPACE, "plain", false)) continue;
      if (ch === "\\" && this.eat(ESCAPE, "escape")) continue;
      if (ch === '"') {
        this.lexDelimited({ open: '"', close: '"', escape: /\\./uy, stops: "$", inner: () => !!this.eat(VARIABLE, "variable") });
        continue;
      }
      if (ch === "'") {
        this.lexDelimited({ open: "'", close: "'" });
        continue;
      }
      if (this.eat(VARIABLE, "variable") || this.eat(FLAG, "attribute")) continue;
      if ((instruction === "ENV" || instruction === "ARG" || instruction === "LABEL") && this.eat(KEY, "property")) continue;
      if (ch === "=") {
        this.emit("operator", ch);
        this.pos++;
        continue;
      }
      if (this.eat(NUMBER, "number")) continue;
      const word = this.match(WORD);
      if (word) {
        const keyword = instruction === "FROM" && /^as$/i.test(word);
        this.emit(keyword ? "keyword" : instruction === "FROM" ? "class" : "plain", word);
        this.pos += word.length;
        continue;
      }
      this.other();
    }
  }
}

export const dockerfile: Language = {
  id: "dockerfile",
  name: "Dockerfile",
  tokenize: (source) => new DockerfileLexer(source).run(),
  score: (source) =>
    scoreSignals(source, [
      {
        weight: 6,
        pattern:
          /^FROM\s+(?:--platform=\S+\s+)?(?:(?:[\w.-]+\/)*[\w.-]+(?::[\w.-]+|@sha256:\w+)|ubuntu|alpine|debian|node|python|nginx|golang|scratch|busybox|centos|redis|postgres|mysql)(?:\s+AS\s+\w+)?[ \t]*$/im,
      },
      { weight: 3, pattern: /^RUN\s+(?:apt-get|apt|apk|yum|dnf|pip3?|npm|yarn|go|mkdir|cd|curl|wget|echo|chmod|set\s|\.\/|\[)/m },
      { weight: 3, pattern: /^(?:COPY|ADD)\s+(?:--\w+=\S+\s+)*\S+\s+\S*[./]\S*[ \t]*$/m },
      { weight: 3, pattern: /^(?:ENTRYPOINT|CMD)\s+\[\s*"/m },
      { weight: 3, pattern: /^(?:WORKDIR\s+\/|EXPOSE\s+\d+|ENV\s+[A-Z_]+[= ]|ARG\s+[A-Z_]+|HEALTHCHECK\s)/m },
    ]),
  sample: `# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
ENV NGINX_PORT=80
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,
};
