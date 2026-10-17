import { NEWLINE, Scanner, SPACE } from "../scanner";
import { scoreSignals, type Signal } from "../signals";
import type { Language } from "../types";

/*
 * Bash / sh / zsh, and command lines copied from terminals and docs.
 * Shell words mean different things by position: the first word of a command
 * is the command (`ls`), keywords only count there (`echo done` is not the
 * end of a loop), and later words are arguments, flags or file names.
 */

const KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "case", "esac", "for", "select", "while", "until",
  "do", "done", "in", "function", "time", "coproc",
]);
const BUILTINS = new Set([
  ".", "alias", "bg", "bind", "break", "builtin", "caller", "cd", "command", "compgen", "complete",
  "continue", "declare", "dirs", "disown", "echo", "enable", "eval", "exec", "exit", "export",
  "false", "fc", "fg", "getopts", "hash", "help", "history", "jobs", "kill", "let", "local",
  "logout", "mapfile", "popd", "printf", "pushd", "pwd", "read", "readarray", "readonly",
  "return", "set", "shift", "shopt", "source", "suspend", "test", "times", "trap", "true", "type",
  "typeset", "ulimit", "umask", "unalias", "unset", "wait",
]);
/** Commands whose next word is itself a command: `sudo apt install`. */
const WRAPPERS = new Set([
  "sudo", "doas", "xargs", "nohup", "time", "env", "exec", "watch", "nice", "command", "builtin",
  "timeout", "stdbuf", "strace", "then", "do", "else", "elif", "if", "while", "until", "!",
]);
/** Operators after which a new command starts. */
const SEPARATOR = /^(?:\|\||&&|\||;;&?|;&|;|\|&|&)$/;

const PROMPT_USER = /(?:\[[^\]\r\n]*\]|[\w.-]+@[\w.-]+(?::[^\s$#]*)?)[$#][ \t]/y;
const PROMPT_DOLLAR = /\$[ \t]/y;
const CONTINUATION = /\\(?:\r\n|\r|\n)/y;
const HEREDOC = /(<<-?)([ \t]*)('[^'\r\n]*'|"[^"\r\n]*"|\\?[A-Za-z_][\w-]*)/y;
const HERESTRING = /<<</y;
const OPERATOR = /\|\||&&|;;&?|;&|\|&|&>>?|\d*>>?(?:&\d*-?)?|\d*<(?:&\d*-?|>)?|[|&;]/y;
const VARIABLE = /\$(?:[A-Za-z_]\w*|[0-9@#?$!*-])/y;
const BRACED_VARIABLE = /\$\{[^}\r\n]*\}?/y;
const ASSIGNMENT = /[A-Za-z_]\w*(?:\[[^\]\r\n]*\])?(?=\+?=)/y;
const ASSIGN_OP = /\+?=/y;
const WORD = /[^\s|&;<>()`'"$\\]+/y;
const ESCAPE = /\\[^\r\n]/uy;
const DQ_ESCAPE = /\\(?:[$`"\\]|\r?\n)/y;
const ANSI_ESCAPE = /\\(?:[abeEfnrtv\\'"?]|[0-7]{1,3}|x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|c.)/y;
const ARITH_NUMBER = /0[xX][0-9a-fA-F]+|\d+(?:#\w+)?/y;
const ARITH_NAME = /[A-Za-z_]\w*/y;
const ARITH_OPERATOR = /[-+*/%<>=!&|^~?:,]+/y;

class ShellLexer extends Scanner {
  /** At the first word of a command. */
  private cmd = true;
  private lineStart = true;
  /** Inside `NAME=value`, whose value doesn't end the command position. */
  private assigning = false;
  /** The previous word was a wrapper such as sudo, so flags may come before the command. */
  private afterWrapper = false;
  private expectLoopVar = false;
  private expectIn = false;
  private expectFunctionName = false;
  private heredocs: { delim: string; strip: boolean }[] = [];

  protected step(): void {
    const src = this.src;
    const ch = src[this.pos];

    const newline = this.match(NEWLINE);
    if (newline) {
      this.emit("plain", newline, false);
      this.pos += newline.length;
      this.heredocBodies();
      this.startCommand();
      this.lineStart = true;
      return;
    }
    if (this.eat(SPACE, "plain", false)) {
      this.assigning = false;
      return;
    }
    if (this.eat(CONTINUATION, "plain", false)) return;
    if (this.lineStart && this.cmd) {
      this.lineStart = false;
      if (this.eat(PROMPT_USER, "comment", false) || this.eat(PROMPT_DOLLAR, "comment", false)) return;
    }
    const wordStart = this.pos === 0 || /[\s;|&()]/.test(src[this.pos - 1]);
    if (ch === "#" && wordStart) {
      this.lineComment();
      return;
    }
    this.lineStart = false;

    if (this.at("<<")) {
      if (this.eat(HERESTRING, "operator")) return;
      HEREDOC.lastIndex = this.pos;
      const m = HEREDOC.exec(src);
      if (m) {
        this.emit("operator", m[1]);
        this.emit("plain", m[2], false);
        this.emit("string", m[3]);
        this.pos += m[0].length;
        this.heredocs.push({ delim: m[3].replace(/^\\|^['"]|['"]$/g, ""), strip: m[1] === "<<-" });
        return;
      }
    }
    const op = this.eat(OPERATOR, "operator");
    if (op) {
      this.assigning = false;
      if (SEPARATOR.test(op)) this.startCommand();
      return;
    }

    if (ch === "(") {
      if (this.cmd && this.at("((")) {
        this.arithmetic("((");
        this.cmd = false;
        return;
      }
      this.openBracket();
      this.startCommand();
      return;
    }
    if (ch === ")") {
      this.closeBracket();
      this.startCommand(); // also ends a `case` pattern
      return;
    }
    if (this.cmd && (ch === "{" || ch === "}") && /^(?:[\s;]|$)/.test(src.charAt(this.pos + 1))) {
      if (ch === "{") {
        this.openBracket();
        this.startCommand();
      } else {
        this.closeBracket();
        this.cmd = false;
      }
      return;
    }

    if (ch === "'") {
      this.lexDelimited({ open: "'", close: "'", multiline: true });
      this.afterWord();
      return;
    }
    if (ch === '"') {
      this.doubleQuoted('"');
      this.afterWord();
      return;
    }
    if (ch === "$") {
      if (this.at("$'")) {
        this.lexDelimited({ open: "$'", close: "'", multiline: true, escape: ANSI_ESCAPE });
        this.afterWord();
        return;
      }
      if (this.at('$"')) {
        this.doubleQuoted('$"');
        this.afterWord();
        return;
      }
      if (this.expansion()) {
        this.afterWord();
        return;
      }
    }
    if (ch === "`") {
      this.substitution("`", "`");
      this.afterWord();
      return;
    }
    if (ch === "\\" && this.eat(ESCAPE, "escape")) {
      this.afterWord();
      return;
    }

    if (this.cmd && !this.assigning) {
      const name = this.match(ASSIGNMENT);
      if (name) {
        this.emit("variable", name);
        this.pos += name.length;
        this.eat(ASSIGN_OP, "operator");
        this.assigning = true;
        return;
      }
    }

    const word = this.match(WORD);
    if (word) {
      this.pos += word.length;
      this.word(word);
      return;
    }
    this.other();
  }

  private startCommand(): void {
    this.cmd = true;
    this.assigning = false;
    this.afterWrapper = false;
  }

  private afterWord(): void {
    if (!this.assigning) this.cmd = false;
  }

  private word(w: string): void {
    if (this.assigning) {
      this.emit("plain", w);
      return;
    }
    if (this.expectFunctionName) {
      this.expectFunctionName = false;
      this.emit("function", w);
      this.cmd = false;
      return;
    }
    if (this.expectLoopVar) {
      this.expectLoopVar = false;
      this.expectIn = true;
      this.emit("variable", w);
      this.cmd = false;
      return;
    }
    if (this.expectIn && w === "in") {
      this.expectIn = false;
      this.emit("control", w);
      this.cmd = false;
      return;
    }
    if (w === "[[" || w === "]]") {
      this.emit("control", w);
      this.cmd = false;
      return;
    }
    if (w === "[" || w === "]") {
      this.emit("builtin", w);
      this.cmd = false;
      return;
    }

    if (this.cmd) {
      if (this.afterWrapper && w.startsWith("-")) {
        this.emit("attribute", w);
        return;
      }
      if (KEYWORDS.has(w)) {
        this.emit("control", w);
        this.cmd = WRAPPERS.has(w);
        if (w === "for" || w === "select") this.expectLoopVar = true;
        else if (w === "case") this.expectIn = true;
        else if (w === "function") this.expectFunctionName = true;
        return;
      }
      const base = w.slice(w.lastIndexOf("/") + 1);
      this.emit(BUILTINS.has(w) ? "builtin" : "function", w);
      this.afterWrapper = WRAPPERS.has(base);
      this.cmd = this.afterWrapper;
      return;
    }

    if (/^--?[A-Za-z0-9]/.test(w)) {
      const eq = w.indexOf("=");
      if (eq > 0) {
        this.emit("attribute", w.slice(0, eq));
        this.emit("operator", "=");
        this.emit("plain", w.slice(eq + 1));
      } else {
        this.emit("attribute", w);
      }
    } else if (/^\d+(?:\.\d+)?$/.test(w)) {
      this.emit("number", w);
    } else {
      this.emit("plain", w);
    }
  }

  private doubleQuoted(open: string): void {
    this.lexDelimited({
      open,
      close: '"',
      multiline: true,
      escape: DQ_ESCAPE,
      stops: "$`",
      inner: () => (this.src[this.pos] === "`" ? (this.substitution("`", "`"), true) : this.expansion()),
    });
  }

  /** `$var`, `${...}`, `$(...)` or `$((...))` at the current position. */
  private expansion(): boolean {
    if (this.at("$((")) {
      this.arithmetic("$((");
      return true;
    }
    if (this.at("$(")) {
      this.substitution("$(", ")");
      return true;
    }
    return !!(this.eat(BRACED_VARIABLE, "variable") || this.eat(VARIABLE, "variable"));
  }

  /** Command substitution: shell code between `open` and `close`. */
  private substitution(open: string, close: string): void {
    const saved = [this.cmd, this.assigning, this.afterWrapper, this.expectIn, this.expectLoopVar];
    this.emit("interpolation", open);
    this.pos += open.length;
    this.startCommand();
    const depth = this.depth;
    // Past the nesting limit the inner text is lexed by the enclosing loop instead.
    this.nested(() => {
      while (this.pos < this.src.length) {
        const closes = close === ")" ? this.src[this.pos] === ")" && this.depth === depth : this.at(close);
        if (closes) {
          this.emit("interpolation", close);
          this.pos += close.length;
          break;
        }
        const before = this.pos;
        this.step();
        if (this.pos === before) this.other();
      }
    });
    [this.cmd, this.assigning, this.afterWrapper, this.expectIn, this.expectLoopVar] = saved;
  }

  /** Arithmetic `((...))` or `$((...))`: names are variables, not commands. */
  private arithmetic(open: string): void {
    this.emit("interpolation", open);
    this.pos += open.length;
    let parens = 0;
    while (this.pos < this.src.length) {
      if (parens === 0 && this.at("))")) {
        this.emit("interpolation", "))");
        this.pos += 2;
        return;
      }
      const ch = this.src[this.pos];
      if (ch === "(") {
        parens++;
        this.openBracket();
      } else if (ch === ")") {
        if (parens === 0) return; // malformed; let the caller continue
        parens--;
        this.closeBracket();
      } else if (
        !(
          this.eat(NEWLINE, "plain", false) ||
          this.eat(SPACE, "plain", false) ||
          this.eat(BRACED_VARIABLE, "variable") ||
          this.eat(VARIABLE, "variable") ||
          this.eat(ARITH_NUMBER, "number") ||
          this.eat(ARITH_NAME, "variable") ||
          this.eat(ARITH_OPERATOR, "operator")
        )
      ) {
        this.other();
      }
    }
  }

  /** After a newline, the bodies of here-documents opened on the previous line. */
  private heredocBodies(): void {
    const src = this.src;
    while (this.heredocs.length) {
      const { delim, strip } = this.heredocs.shift() as { delim: string; strip: boolean };
      const bodyStart = this.pos;
      let line = this.pos;
      for (;;) {
        const text = this.restOfLine(line);
        if ((strip ? text.replace(/^\t+/, "") : text) === delim) {
          this.emit("string", src.slice(bodyStart, line));
          this.emit("string", text);
          this.pos = line + text.length;
          break;
        }
        let next = line + text.length;
        if (next >= src.length) {
          this.emit("string", src.slice(bodyStart)); // unterminated
          this.pos = src.length;
          return;
        }
        next += src[next] === "\r" && src[next + 1] === "\n" ? 2 : 1;
        line = next;
      }
      if (this.heredocs.length) {
        const nl = this.match(NEWLINE);
        if (!nl) return;
        this.emit("plain", nl, false);
        this.pos += nl.length;
      }
    }
  }
}

const STRONG_COMMANDS = [
  "sudo", "doas", "apt", "apt-get", "dpkg", "yum", "dnf", "rpm", "pacman", "zypper", "apk", "brew",
  "snap", "flatpak", "ls", "cd", "grep", "egrep", "awk", "sed", "chmod", "chown", "chgrp", "mkdir",
  "rmdir", "rm", "cp", "mv", "curl", "wget", "tar", "gzip", "gunzip", "unzip", "ssh", "scp", "sftp",
  "rsync", "git", "docker", "docker-compose", "podman", "kubectl", "helm", "minikube", "systemctl",
  "journalctl", "npm", "npx", "yarn", "pnpm", "pip", "pip3", "pipx", "conda", "ifconfig", "netstat",
  "nslookup", "dig", "traceroute", "uname", "whoami", "crontab", "nano", "vim", "vi", "terraform",
  "ansible", "ansible-playbook", "export", "unset", "alias", "df", "du", "ps", "pwd", "lsblk",
  "lsof", "umount", "fdisk", "mkfs", "iptables", "ufw", "firewall-cmd", "ssh-keygen",
  "ssh-copy-id", "openssl", "xargs", "nohup", "useradd", "usermod", "userdel", "groupadd",
  "passwd", "htop", "nmap", "tcpdump", "aws", "az", "gcloud", "cargo", "rustup", "gcc", "g\\+\\+",
  "clang", "cmake", "javac", "mvn", "gradle", "dotnet", "bash", "zsh", "sh", "echo", "printf",
  "python3?", "node", "deno", "bun", "pkill", "pgrep", "killall", "sysctl", "dmesg", "chroot",
  "hostnamectl", "timedatectl", "jq", "ln", "wc", "uniq",
].join("|");
// Commands that are also everyday English words only count a little.
const WEAK_COMMANDS = [
  "make", "find", "cat", "head", "tail", "sort", "cut", "tr", "diff", "less", "more", "top", "kill",
  "free", "uptime", "which", "touch", "stat", "history", "ping", "ip", "ss", "hostname", "reboot",
  "shutdown", "source", "exit", "read", "test", "sleep", "date", "man", "file", "watch", "time",
  "env", "set", "type", "go", "ruby", "perl", "php", "mount", "service", "locate", "tee",
].join("|");

// Subcommands that make "git push" or "npm install" code even without flags.
const SUBCOMMANDS = [
  "status", "add", "commit", "push", "pull", "clone", "checkout", "switch", "log", "diff", "merge",
  "rebase", "branch", "fetch", "init", "stash", "tag", "remote", "reset", "run", "build", "ps", "exec",
  "logs", "images", "compose", "get", "describe", "apply", "delete", "create", "install", "uninstall",
  "update", "upgrade", "list", "search", "show", "start", "stop", "restart", "enable", "disable", "plan",
  "test", "login", "deploy", "config", "version", "remove", "rm", "i", "ci", "publish", "rollout",
].join("|");

const SIGNALS: Signal[] = [
  { weight: 10, pattern: /^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:ba|z|k|da|fi)?sh\b/ },
  // A prompt followed by a command: "$ ls", "user@host:~$ git status" (not "$ 500").
  { weight: 4, pattern: /^[ \t]*(?:\$|[\w.-]+@[\w.-]+(?::\S*)?[$#]|\[[^\]\n]+\][$#])[ \t]+[a-z./~][\w./-]*(?:[ \t]|$)/m },
  // A command name alone is weak evidence ("export to excel", "python 3 training") ...
  { weight: 2, pattern: new RegExp(`^[ \\t]*(?:sudo[ \\t]+)?(?:${STRONG_COMMANDS})(?=[ \\t]|$)`, "m") },
  // ... but strong with a subcommand, or followed by a flag, path, variable, quote or nothing.
  { weight: 3, pattern: new RegExp(`^[ \\t]*(?:sudo[ \\t]+)?(?:${STRONG_COMMANDS})[ \\t]+(?:${SUBCOMMANDS})(?:[ \\t]|$)`, "m") },
  {
    weight: 2,
    pattern: new RegExp(
      `^[ \\t]*(?:sudo[ \\t]+)?(?:${STRONG_COMMANDS})(?:[ \\t]+(?:-|\\.{0,2}\\/|~|\\$|"|'|[\\w.-]+\\.[a-z]{1,4}(?:[ \\t]|$)|[\\w-]+\\/)|[ \\t]*$)`,
      "m"
    ),
  },
  { weight: 1, pattern: new RegExp(`^[ \\t]*(?:${WEAK_COMMANDS})(?=[ \\t]|$)`, "m") },
  { weight: 1, pattern: /[ \t]--?[A-Za-z][\w-]*(?==|[ \t]|$)/m },
  { weight: 2, pattern: /[ \t]--?[A-Za-z][\w-]*(?:=\S*)?[ \t][^\n]*?[ \t]--?[A-Za-z][\w-]*(?:=\S*)?(?=[ \t]|$)/m },
  { weight: 2, pattern: /[ \t]\|[ \t]*[a-z]/ },
  { weight: 1, pattern: /[ \t](?:&&|\|\|)[ \t]/ },
  { weight: 1, pattern: /\$\{?[A-Za-z_]\w*\}?|\$[0-9@#?]/ },
  { weight: 2, pattern: /\$\((?!\()/ },
  { weight: 3, pattern: /^[ \t]*(?:if[ \t]+\[\[?[ \t]|(?:fi|done|esac)[ \t]*(?:;|$)|(?:then|do)[ \t]*$)/m },
  { weight: 2, pattern: /2>&1|>[ \t]*\/dev\/null|\|[ \t]*(?:grep|awk|sed|xargs|sort|wc|head|tail|tee)\b/ },
  { weight: 1, pattern: /(?:^|[ \t])(?:~|\.{1,2})?\/[\w.-]+\/[\w./-]*/m },
  { weight: 2, pattern: /^[ \t]*(?:export[ \t]+)?[A-Z_][A-Z0-9_]*=\S/m },
];

export const shell: Language = {
  id: "shell",
  name: "Bash / Linux shell",
  tokenize: (source) => new ShellLexer(source).run(),
  score: (source) => scoreSignals(source, SIGNALS),
  sample: `#!/usr/bin/env bash
# Archive logs older than a week
set -euo pipefail
LOG_DIR="\${1:-/var/log/myapp}"
for f in $(find "$LOG_DIR" -name '*.log' -mtime +7); do
  gzip -9 "$f" && echo "archived: $f"
done
sudo systemctl restart myapp 2>&1 | tee -a /tmp/restart.log`,
};
