# Publishing Code Highlighter

An Office add-in is a small website plus a manifest that tells Excel where the website is. To use it anywhere, you host the website once, then either deploy the manifest yourself (fast) or list it in Microsoft Marketplace, formerly AppSource (takes weeks).

**Current choice (18 October 2026): no store listing.** Microsoft Marketplace needs a Partner Center account signed in with a work (Microsoft Entra) account, and this one uses a personal Microsoft account. The add-in is distributed instead through the GitHub repository and the hosted manifest at https://code-highlighter-eight.vercel.app/manifest.xml; people install it as described under *Install* in [README.md](README.md). Section 4 stays here in case you get a work account later.

## 1. Your details

| Where | Value |
|---|---|
| `manifest.xml` → `<ProviderName>` | `aries` (done). Must exactly match your Partner Center publisher name, capitalisation included. |
| `src/pages/support.html`, `privacy.html`, `terms.html` | Contact `ariesking543@yahoo.com` (done). The privacy policy and terms name "aries" as publisher; re-read them if your circumstances change (for example, a company publishes it instead). |
| `manifest.xml` → `<DisplayName>`, `<Description>` | Optional rename. |
| `manifest.xml` → `<Id>` | Leave it. This GUID identifies the add-in forever; updates must keep it. |
| `manifest.xml` → `<Version>` | Increase it (for example `1.0.1.0`) every time you ship an update. |

## 2. Host the add-in

**Done:** the add-in is hosted on Vercel at **https://code-highlighter-eight.vercel.app/** (team *Aries*, project *code-highlighter*, a static site with no build step). To publish a new version after changing the code (PowerShell):

```powershell
$env:ADDIN_PUBLIC_URL = "https://code-highlighter-eight.vercel.app/"; npm run build
$env:VERCEL_ORG_ID = "team_weWrVnpEuvhjwnSr2WvLct98"; $env:VERCEL_PROJECT_ID = "prj_BrH42Rtgtp2aulVLXqQTEDaIiSS2"; vercel deploy dist --prod --yes
```

Increase `<Version>` in `manifest.xml` before rebuilding whenever the manifest itself changes. Keep the URL the same: installed copies and the store listing point at it.

Any other static HTTPS host also works (GitHub Pages, Azure Static Web Apps, Cloudflare Pages, Netlify). It must stay online, because Excel loads the add-in from it every time.

Build with your host's URL so the production manifest points there (PowerShell):

```powershell
$env:ADDIN_PUBLIC_URL = "https://your-host.example.com/"; npm run build
```

Upload everything in `dist/` to the root of that URL. Check that these open in a browser:

- `https://your-host.example.com/taskpane.html`
- `https://your-host.example.com/support.html`
- `https://your-host.example.com/privacy.html`
- `https://your-host.example.com/terms.html`

`dist/manifest.xml` is the production manifest. Validate it:

```bash
npx office-addin-manifest validate dist/manifest.xml
```

## 3. Use it everywhere now, without the store

**Microsoft 365 admin center (recommended if you manage your Microsoft 365 Business tenant).** Go to admin.microsoft.com → Settings → Integrated apps → Upload custom apps, choose Office Add-in, and upload `dist/manifest.xml`. Assign it to yourself, or to everyone. Within a few hours it appears on the Home tab in Excel for Windows, Mac and the web, wherever you sign in.

**Excel on the web, just for you.** Home → Add-ins → More Settings → Upload My Add-in, then pick `dist/manifest.xml`. Good for testing the hosted version.

**Anyone, from GitHub.** Attach `dist/manifest.xml` to a GitHub release so people can download it next to the source, and point them at the *Install* section of [README.md](README.md) (Excel on the web, the Windows shared-folder catalog, the Mac `wef` folder, or their admin center). Because the manifest points at the hosted site, redeploying to Vercel updates everyone at once; publish a new release only when the manifest itself changes, with a higher `<Version>`.

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
