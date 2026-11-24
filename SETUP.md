# ÉLISE: set up and install on your Pixel (Checkpoint 1)

ÉLISE has two parts, the same shape as VERA:

| Part | Where it lives | What it does |
|---|---|---|
| **API** | A standalone Apps Script project (`apps-script/`) | Reads your calendars, keeps state in the **ÉLISE** Google Sheet, answers only requests carrying your token |
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

1. Go to <https://script.google.com> › **New project**. Rename it **ÉLISE**.
2. **Project Settings** (gear icon) › tick **Show "appsscript.json" manifest file in editor**.
3. Back in **Editor**:
   - open `appsscript.json`, replace everything with the contents of [`apps-script/appsscript.json`](apps-script/appsscript.json);
   - open `Code.gs`, replace everything with the contents of [`apps-script/Code.js`](apps-script/Code.js).
   - Save (Ctrl/Cmd + S).
4. In the function menu at the top choose **setup** › **Run**. Approve the permissions
   (Google shows "unverified app" because it's your own script: **Advanced › Go to ÉLISE**).
   It asks for: Sheets (to create and use the ÉLISE Sheet) and Calendar, read-only.
5. Open **Execution log**. It shows the ÉLISE Sheet link and your **Token**. Keep the token private.
6. **Deploy › New deployment** › type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (like VERA; every request still needs the token)
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).

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

## Updating the API later

When `apps-script/Code.js` changes, paste it into `Code.gs` again, then
**Deploy › Manage deployments › ✏️ Edit › Version: New version › Deploy**.
That keeps the same URL, so the phone needs nothing. The app itself updates on its own after each push to `main`.
