# Publishing Code Highlighter

An Office add-in is a small website plus a manifest that tells Excel where the website is. To use it anywhere, you host the website once, then either deploy the manifest yourself (fast) or list it in Microsoft Marketplace, formerly AppSource (takes weeks).

**Current choice (18 October 2026): no store listing.** Microsoft Marketplace needs a Partner Center account signed in with a work (Microsoft Entra) account, and this one uses a personal Microsoft account. Everything is on GitHub instead: the code in this repository, the add-in hosted on GitHub Pages, and `manifest.xml` attached to each GitHub release. People install it as described under *Install* in [README.md](README.md). Section 4 stays here in case you get a work account later.

## 1. Your details

| Where | Value |
|---|---|
| `manifest.xml` → `<ProviderName>` | `aries` (done). Must exactly match your Partner Center publisher name, capitalisation included. |
| `src/pages/support.html`, `privacy.html`, `terms.html` | Contact `ariesking543@yahoo.com` (done). The privacy policy and terms name "aries" as publisher; re-read them if your circumstances change (for example, a company publishes it instead). |
| `manifest.xml` → `<DisplayName>`, `<Description>` | Optional rename. |
| `manifest.xml` → `<Id>` | Leave it. This GUID identifies the add-in forever; updates must keep it. |
| `manifest.xml` → `<Version>` | Increase it (for example `1.0.1.0`) every time you ship an update. |

## 2. Host the add-in

**Done:** the add-in is hosted on GitHub Pages at **https://leng-phirun.github.io/excel-code-highlighter/**. Every push to `main` runs [.github/workflows/pages.yml](.github/workflows/pages.yml), which type-checks, lints and tests the code, builds it with that address and deploys `dist/` to Pages; follow it under the repository's **Actions** tab. Installed copies load the new version the next time Excel opens the add-in.

Keep the address the same: every installed manifest points at it. The site must stay online, because Excel loads the add-in from it every time.

### Release a new manifest

Only needed when `manifest.xml` itself changes (name, buttons, icons, permissions, requirements). Increase `<Version>` in `manifest.xml`, push, wait for the Pages deploy to finish, then attach the production manifest to a new release (PowerShell):

```powershell
$env:ADDIN_PUBLIC_URL = "https://leng-phirun.github.io/excel-code-highlighter/"; npm run build
npx office-addin-manifest validate dist/manifest.xml
gh release create v1.0.2 dist/manifest.xml --title "Code Highlighter 1.0.2" --notes "What changed, and that people should install the new manifest."
```

Anyone who installed an older manifest needs to install the new one.

### Another host

Any static HTTPS host works the same way (Azure Static Web Apps, Cloudflare Pages, Netlify). Build with its address in `ADDIN_PUBLIC_URL`, upload everything in `dist/` to the root of that address, and check that `taskpane.html`, `support.html`, `privacy.html` and `terms.html` open in a browser. Moving host changes every URL in the manifest, so it needs a new manifest release, and the privacy policy names the host.

## 3. Use it everywhere now, without the store

**Microsoft 365 admin center (recommended if you manage your Microsoft 365 Business tenant).** Go to admin.microsoft.com → Settings → Integrated apps → Upload custom apps, choose Office Add-in, and upload `dist/manifest.xml`. Assign it to yourself, or to everyone. Within a few hours it appears on the Home tab in Excel for Windows, Mac and the web, wherever you sign in.

**Excel on the web, just for you.** Home → Add-ins → More Settings → Upload My Add-in, then pick `dist/manifest.xml`. Good for testing the hosted version.

**Anyone, from GitHub.** Point people at the *Install* section of [README.md](README.md): one command on Windows or Mac (the scripts in `install/`, served from GitHub Pages with the host address filled in by the build), an upload in Excel on the web, or their admin center. Attach `dist/manifest.xml` to each GitHub release for the web and admin-center routes. Because the manifest points at the hosted site, each push to `main` updates everyone at once; publish a new release only when the manifest itself changes, with a higher `<Version>` (see section 2).

## 4. Submit to Microsoft Marketplace

### Account

1. Sign in to [Partner Center](https://partner.microsoft.com/dashboard) with a Microsoft Entra work account (your Microsoft 365 Business sign-in works).
2. Enroll in the **Microsoft 365 and Copilot program**: Settings → Account settings → Programs → Microsoft 365 and Copilot → Get started. New accounts go through company verification, which can take a few days. You need your legal business name, address and a contact.

### Offer

1. Marketplace offers → **Microsoft 365 and Copilot** tab → **+ New offer** → Office Add-in.
2. Enter the name, select **Check availability**, choose your publisher (it can't be changed later), then **Create**.
3. **Product setup**: answer the questions. This add-in has no sign-in, no SSO, no extra purchases and no CRM.
4. **Packages**: upload `dist/manifest.xml`.
5. **Properties**: pick categories (for example Productivity, Developer Tools). Legal and support: privacy policy = `…/privacy.html`, support document = `…/support.html`, and either the EULA link `…/terms.html` or Microsoft's Standard Contract.
6. **Marketplace listings**: name, summary, description, logo, screenshots (draft text below).
7. **Availability**: release date. It can't be changed after the first publish.
8. **Review and publish**: add the certification notes below, then submit.

### Listing draft

- **Name** (30 recommended, 50 max): `Code Highlighter`
- **Summary** (70 recommended, 100 max): `Syntax-highlight code in Excel cells: Python, SQL, shell, VBA and 27 more languages.`
- **Description** (keep under 4,000 characters):

  > Paste code into a spreadsheet and it turns into a wall of black text. Code Highlighter colours it the way a code editor does, directly inside the cell, so test cases, code reviews, training material and documentation stay readable.
  >
  > • Select cells and choose Home › Highlight. Keywords, strings, comments, numbers, functions, classes, decorators, interpolation and brackets each get their own colour.
  > • 31 languages, detected automatically per cell: Python, Bash and Linux shell commands, PowerShell, Windows Batch, SQL, JavaScript, TypeScript, Java, C#, VBA / Visual Basic, C, C++, Go, Rust, Kotlin, Swift, PHP, Ruby, R, Scala, Dart, Lua, HTML/XML, CSS, JSON, YAML, TOML/INI, Markdown, Dockerfile, Terraform/HCL and diffs.
  > • Terminal commands copied from docs keep their prompts dimmed, with commands, flags, pipes and variables told apart.
  > • Turn on auto-highlight and any cell you type or paste code into is coloured as soon as you finish editing. Notes and labels are left alone.
  > • Choose Dark+, Light+, GitHub Light, Monokai or One Dark, any monospace font, and whether to fill the cell, widen the column and fit the row height.
  > • Your code is never changed or sent anywhere. Everything runs inside Excel.


- **Logo**: `assets/icon-300.png`.
- **Screenshots**: `assets/store-screenshot-1366x768.png` (1366 × 768, 95 KB; the store needs at least one at exactly that size, at most 1 MB). It shows five languages highlighted with the Code Settings pane open; the account photo in the title bar is pixelated.

### Notes for certification (paste into the submission)

> No account, sign-in or sample file is needed.
> 1. Open a new blank workbook. In A1 type `def add(a, b):`, press Alt+Enter, type `    return a + b  # sum`, and press Enter.
> 2. Select A1 and choose Home › Code › Highlight. The code is coloured inside the cell.
> 3. Choose Home › Code › Code Settings, switch the theme to Light+, select A1 and choose Highlight again to see it restyled.
> 4. With Auto-highlight on (the default), type `print("hello")` into A3 and press Enter; it is highlighted as Python. Type `ls -la /var/log | grep error` into A5; it is highlighted as a shell command. Type `hello world` into A4; it is left alone.
> 5. Select A1 and choose Home › Code › Remove to restore plain text.
> Requires ExcelApi 1.18 and SharedRuntime 1.1 (Microsoft 365 Excel on Windows 2501+, Mac 16.93+, or Excel on the web).

### What reviewers check

- It works on every platform the manifest allows: Windows, Mac and the web (the shared runtime it needs isn't available on iPad, so Excel doesn't offer it there; don't select iPad in Partner Center). Test the hosted build on at least Windows and the web before you submit, and on a Mac if you can.
- Every feature works with touch only, and the pane is readable at narrow widths.
- The help, privacy and terms links load, and the support page isn't an email address or a GitHub repository.
- Office.js loads from Microsoft's current CDN, `officeapis.public.onecdn.static.microsoft`, which Marketplace add-ins must use (it does: `taskpane.html`).
- The manifest version matches the version in the submission form.

Microsoft says to expect feedback within 3 to 4 business days when something fails, and the whole process often takes several weeks and more than one submission. Fix what the report lists, increase `<Version>`, rebuild, re-upload and resubmit.
