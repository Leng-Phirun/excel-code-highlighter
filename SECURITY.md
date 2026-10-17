# Security

## Reporting a problem

Please report security problems privately by email to ariesking543@yahoo.com, not in a public issue. Include what you found and how to reproduce it. Fixes are released as soon as they're ready; because the add-in loads from GitHub Pages, most reach everyone without a reinstall.

## What the add-in can do

- **In Excel:** it reads the text of the cells you highlight (or edit, with auto-highlight on) and writes colours and fonts back to them. The manifest asks for `ReadWriteDocument`, the permission that formatting cells needs.
- **On the network:** nothing. It sends no workbook content, code or personal data anywhere. Excel downloads the add-in's files from GitHub Pages and Office.js from Microsoft; see the [privacy policy](https://leng-phirun.github.io/excel-code-highlighter/privacy.html).
- **In the page:** cell text is only ever inserted as text (`textContent`), never as HTML, and stored preferences are checked against fixed lists before use.

## What the install scripts change

- **Windows (`install.ps1`):** creates `%USERPROFILE%\CodeHighlighter` with the manifest and a README, shares it read-only for your account only as `\\localhost\CodeHighlighter` (the only step that runs as administrator), and adds a trusted add-in catalog entry under `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs`. Without administrator permission it instead adds one value under `HKCU\Software\Microsoft\Office\16.0\WEF\Developer`. `uninstall.ps1` removes all of it, and leaves alone any share or folder of the same name that it didn't create.
- **Mac (`install.sh`):** copies the manifest into `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef`. `uninstall.sh` deletes it.

Both installers download only over HTTPS, and refuse a manifest that isn't Code Highlighter's or that points anywhere other than the add-in's own site.

## How releases are built

GitHub Actions builds and deploys the site from `main` ([workflow](.github/workflows/pages.yml)). Actions are pinned to exact commits, dependencies install without running their install scripts, the build job can only read the repository, and only the deploy job can publish. The add-in has no runtime dependencies: the published JavaScript is this repository's own code.
