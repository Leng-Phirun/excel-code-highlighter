# Code Highlighter for Excel

An Office add-in that syntax-highlights code inside Excel cells in 31 languages: Python, Bash and Linux shell commands, PowerShell, Windows Batch, SQL, JavaScript, TypeScript, Java, C#, VBA / Visual Basic, C, C++, Go, Rust, Kotlin, Swift, PHP, Ruby, R, Scala, Dart, Lua, HTML/XML, CSS, JSON, YAML, TOML/INI, Markdown, Dockerfile, Terraform/HCL and diffs. It colours the text *in the cell itself* (true rich text, not a picture or text box), using Excel's `RangeTextRun` API.

- **Highlight** (Home tab): colours the code in the selected cells, detecting each cell's language unless one is chosen in Code Settings.
- **Remove** (Home tab): turns highlighted cells back to plain black text with no fill.
- **Code Settings** (Home tab): language (or auto-detect), theme (Dark+, Light+, GitHub Light, Monokai, One Dark), font, size, fill/column/row options, and **auto-highlight**, which colours any cell you type or paste code into as soon as you finish editing it.

Each language has its own hand-written lexer, so highlighting follows the real syntax: f-strings and template literals highlight the code inside them, shell commands are told apart from their flags and arguments (and terminal prompts like `user@host:~$` are dimmed), HTML colours embedded `<script>` and `<style>` blocks, and so on. Detection is deliberately cautious: ordinary notes and labels score zero and are never auto-highlighted.

Requires Microsoft 365 Excel for Windows (Version 2501+), Mac (16.93+) or Excel on the web — anything supporting ExcelApi 1.18 and the shared runtime. Excel 2024 LTSC and older perpetual versions don't support it, and Excel on iPad doesn't support the shared runtime, so the add-in isn't offered there.

![Code Highlighter colouring Python, SQL, shell, JavaScript and VBA in Excel](assets/store-screenshot-1366x768.png)

## Install

Code Highlighter isn't in the Office store; you install it with one command. It runs from GitHub Pages, so updates arrive automatically and you never need to reinstall unless a release says so.

### Windows

Open **PowerShell** (Start menu › type *PowerShell*), paste this and press Enter:

```powershell
irm https://leng-phirun.github.io/excel-code-highlighter/install.ps1 | iex
```

Choose **Yes** when Windows asks for permission. Then, once, in Excel: **Home › Add-ins › Advanced**, open the **SHARED FOLDER** tab, select **Code Highlighter** and choose **Add**. The **Code** group stays on the Home tab from then on.

The script downloads the manifest to `%USERPROFILE%\CodeHighlighter`, shares that folder as `\\localhost\CodeHighlighter` (read-only, for your account only; this is the step that needs permission) and adds it to Excel's trusted add-in catalogs. That's Microsoft's [shared-folder method](https://learn.microsoft.com/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins), automated. Without permission it registers Code Highlighter as a developer add-in instead, which you choose under **Home › Add-ins** each time Excel starts. [Read the script](install/install.ps1) before running it if you like.

To remove it:

```powershell
irm https://leng-phirun.github.io/excel-code-highlighter/uninstall.ps1 | iex
```

### Mac

Open Excel once, quit it, then open **Terminal**, paste this and press Return:

```bash
curl -fsSL https://leng-phirun.github.io/excel-code-highlighter/install.sh | sh
```

Open Excel and choose **Home › Add-ins › Code Highlighter**. The script copies the manifest into `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef`, the folder Excel for Mac loads add-ins from ([script](install/install.sh)). To remove it, run the same command with `uninstall.sh`.

### Excel on the web

No script needed. **[Download manifest.xml](https://github.com/Leng-Phirun/excel-code-highlighter/releases/latest/download/manifest.xml)**, open a workbook in Excel on the web, choose **Home › Add-ins › More Settings › Upload My Add-in**, and upload the file. Excel remembers it in that browser; after clearing the browser's data or switching browsers, upload it again.

### Everyone in an organisation

A Microsoft 365 admin can install it for all users: **admin.microsoft.com › Settings › Integrated apps › Upload custom apps**, choose **Office Add-in**, upload `manifest.xml` from the [latest release](https://github.com/Leng-Phirun/excel-code-highlighter/releases/latest), and assign it. It then appears in Excel on Windows, Mac and the web for everyone assigned.

## Project layout

| Path | What it is |
|---|---|
| `manifest.xml` | Add-in manifest (ribbon buttons, shared runtime, requirement sets) |
| `src/highlighter/types.ts` | Token types and the `Language` interface |
| `src/highlighter/scanner.ts` | Shared lexer base: emitting, quoted literals, brackets |
| `src/highlighter/languages/` | One lexer + detector per language; `index.ts` is the registry and auto-detection |
| `src/highlighter/languages/engine.ts` | One configurable lexer shared by most languages (comments, strings, interpolation, sigils, ...) |
| `src/highlighter/languages/clike.ts` | JS, TS, Java, C#, C, C++, Go, Rust, Kotlin, Swift, Scala and Dart on that engine |
| `src/highlighter/languages/scripting.ts` | PHP, Ruby, Lua, R and Terraform on that engine |
| `src/highlighter/signals.ts` | Weighted-evidence scoring used by every detector |
| `src/highlighter/themes.ts` | Colour themes |
| `src/highlighter/runs.ts` | Tokens → the fewest possible styled text runs |
| `src/excel/highlight.ts` | Reads cells and writes rich text through Office.js |
| `src/excel/auto.ts` | Auto-highlight on cell edits |
| `src/taskpane/` | Code Settings pane; also hosts the ribbon button handlers |
| `src/pages/` | Help, privacy and terms pages, linked from the add-in |
| `assets/` | Icons, generated by `npm run icons` |
| `install/` | One-command installers for Windows (PowerShell) and Mac (shell), served from GitHub Pages |
| `.github/workflows/pages.yml` | Tests, builds and deploys to GitHub Pages on every push to `main` |

## Develop

```bash
npm install
```

```bash
npm test
```

Trust the local HTTPS certificate once (Windows asks you to confirm installing a development certificate):

```bash
npx office-addin-dev-certs install
```

Start the dev server and open Excel with the add-in sideloaded:

```bash
npm start
```

Stop and unregister it:

```bash
npm run stop
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run validate` (manifest check). A production build needs the address it will be hosted at: `ADDIN_PUBLIC_URL=https://your-host/ npm run build` writes `dist/`.

## Adding another language

Add a module in `src/highlighter/languages/` exporting a `Language`: a lexer (usually a `Scanner` subclass) whose tokens reproduce the input exactly, a `score` built from `Signal`s, and a preview sample. For most languages a `define({...})` call on the shared engine (see `clike.ts` and `scripting.ts`) is enough. Register it in `languages/index.ts`; `test/languages.test.ts` then fuzzes it automatically, and you should add detection cases to `test/detect.test.ts`. Themes and the Excel layer work on token types, so they don't change.

## Publishing

See [PUBLISHING.md](PUBLISHING.md).

## License

[MIT](LICENSE)
