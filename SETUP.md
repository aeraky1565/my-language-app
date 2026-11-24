# ÉLISE: set up and install on your Pixel (Checkpoint 1)

ÉLISE has two parts, the same shape as VERA:

| Part | Where it lives | What it does |
|---|---|---|
| **API** | A standalone Apps Script project (`apps-script/`) | Reads your calendars, keeps state in the **Elise** Google Sheet, answers only requests carrying your token |
| **App** | GitHub Pages (`web/`) | The screens. Installed on the Pixel as a home-screen app, full-screen with its own icon |

Total time: about 10 minutes, once.

---

## 1. Turn on GitHub Pages (once)

> **The repo is private.** GitHub Pages on a private repo needs a paid GitHub plan (Pro). Either make the repo public (it contains no personal data: the content library and code only; your token and calendar data never go in the repo) or use a Pro account.

1. Merge this work into `main` (or ask Claude to open the pull request).
2. On GitHub: **my-language-app › Settings › Pages › Build and deployment › Source: GitHub Actions**.
3. The **Deploy ÉLISE web app** action runs on every push to `main`. When it's green, the app is at
   `https://aeraky1565.github.io/my-language-app/`.

## 2. Create the Apps Script API (once)

The code is pushed to Apps Script by GitHub Actions with **clasp**
(`.github/workflows/apps-script.yml`), on every push to `main` that touches `apps-script/`.

**a. The project** ✅ done: **ELISE** (`1FIyyXRz…`), with its web app deployment `AKfycby6G…`.
Both ids are in the repo (`.clasp.json` and the workflow); neither is a secret.

**b. Let GitHub push with your clasp login** (skip 1–2 if clasp already works on your computer for VERA)
1. Turn on the Apps Script API for your account: <https://script.google.com/home/usersettings> › **Google Apps Script API: On**.
2. On your computer: `npx @google/clasp@3.4.1 login` and approve in the browser.
3. Open the file it wrote, `~/.clasprc.json` (Windows: `C:\Users\<you>\.clasprc.json`), and copy all of it.
4. GitHub › **my-language-app › Settings › Secrets and variables › Actions › New repository secret**:
   name **`CLASPRC_JSON`**, value: the whole file. **Never paste it in a chat.**

Once the script id is in `.clasp.json` and the secret exists, the **Push ÉLISE Apps Script** action
puts `Code.js` and `appsscript.json` into the project.

**c. Run setup and deploy (once, in the Apps Script editor)**
1. Open the ÉLISE project. In the function menu choose **setup** › **Run**. It fills your **Elise** Sheet
   (adds `Config`, `Visits`, `Saved`, removes the empty `Sheet1`). Approve the permissions
   (Google shows "unverified app" because it's your own script: **Advanced › Go to ÉLISE**).
   It asks for Sheets (the Elise Sheet) and Calendar, read-only.
2. **Execution log** shows your **Token**. Keep it private.
3. The web app already exists. Every push moves it to the new code, and the manifest sets
   Execute as **Me**, access **Anyone** (like VERA; every request still needs the token). Its URL is
   `https://script.google.com/macros/s/AKfycby6G-fZW5oj01nxuXsC6AkJw28fPToJyEFTdCgqpWkE-9cEscfBPtODgzSbRTjb8wPS/exec`.

## 3. Install on the Pixel

1. On the phone, open Chrome and go to (one line, with your two values):
   ```
   https://aeraky1565.github.io/my-language-app/#api=<WEB APP URL>&token=<TOKEN>
   ```
   Tip: email the link to yourself from the computer and tap it on the phone.
   This connects the phone once; the link is cleared from the address bar right away.
   (Without the link, the app shows a "Connecter ÉLISE" screen where you paste both.)
2. Chrome menu **⋮ › Add to Home screen › Install**.
3. Open **ÉLISE** from the home screen: it runs full-screen, like VERA.

## 4. Check the French voice

1. In ÉLISE: **Réglages** (sliders icon, top right) › **Voix** shows how many French voices Chrome sees.
   Tap the speaker to hear a sample at the chosen speed.
2. If it says none: Pixel **Settings › System › Languages › Text-to-speech output ›
   Speech Services by Google › ⚙ › Install voice data › Français (France)**, then reopen ÉLISE.

## What to check for Checkpoint 1

- [ ] ÉLISE opens from the home screen with no address bar.
- [ ] Today shows *dépensier* and *Tu crois que ça vaut le coup ?*; the streak reads **1**.
- [ ] English lines are blurred and reveal on tap.
- [ ] The speakers and **Écouter** (dialogue) speak French; the dialogue highlights each line.
- [ ] Bookmark the word and the phrase: they appear in **Mes mots** and in the Sheet's **Saved** tab.
- [ ] **Réglages** lists your calendars and finds `Vera · French`.

## Updating later

Nothing to do: a push to `main` redeploys the app (GitHub Pages) and the API (clasp, same `/exec` URL).
If a code change needs a new permission, Apps Script asks for it the next time you run a function in the editor.
