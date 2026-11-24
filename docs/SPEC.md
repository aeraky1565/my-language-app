# ÉLISE: current spec

This file records what changed from [`original-spec.md`](original-spec.md) (the first brief) after
the design and platform decisions of 24 Nov 2026. **Where the two disagree, this file wins.**
Sections not mentioned here (content model §3, theme library §4, weekly theme selection §5,
default calendar §6) still apply as written, with "the device" read as "the Apps Script API".

Design canvas: <https://claude.ai/artifact/H2ZSgRooxsmPRhwDmmJJAW>

## 1. Platform (replaces original §1)

Built like VERA, not as a native Android app.

| | Original | Now |
|---|---|---|
| Front end | Kotlin / Compose APK, sideloaded | Installable web app (PWA) on GitHub Pages, added to the Pixel home screen; opens full-screen with its own icon |
| Logic + scheduling | On device, WorkManager | Standalone **Apps Script** project: JSON API (`doGet`, token-gated) + time-driven triggers |
| Storage | Room / DataStore | The **ÉLISE** Google Sheet: `Config` (key/value settings), `Visits`, `Saved`, later `Themes`, `Entries`, `ThemeWeeks`, `Shown` |
| Calendars | `CalendarContract` on the phone | `CalendarApp` on the server, read-only for your calendars and Vera's |
| Speech | Android `TextToSpeech` | Chrome `speechSynthesis`, `fr-FR`. On a Pixel this is Speech Services by Google, the same voices |
| Secrets | none | `ELISE_SHEET_ID` and `ELISE_TOKEN` in Script Properties; the phone keeps the API URL and token in local storage |
| CI | Signed APK build | GitHub Actions deploys `web/` to Pages on push to `main` |

Time zone: America/New_York (from the default calendar at runtime).
"No backend / no accounts / no network calls" no longer holds: it runs under your Google account.

## 2. Screens (replaces original §2)

- **Look:** editorial: cream `#F7F4EE`, navy `#1E2A4A`, Fraunces for French, Inter for UI, touch targets ≥ 44 px.
- **Terracotta:** `#C8553D` for icons and fills only; `#A8432E` for small text on cream; coral `#E8957F` on navy (contrast).
- **Dark mode** follows the phone setting (deep navy `#121A2E`).
- **Today:** one scroll. Date + Bonjour/Bonsoir, streak chip, settings button. Theme banner with N/7,
  "Next", week dots and a small "Pourquoi ce thème ?" footer. Word card shows everything; **every English
  line is blurred until tapped** (the Français/English toggle is dropped). Phrase card has its own
  **bookmark**. The 4-line dialogue starts **folded**; "Écouter" plays it with a pause between lines,
  highlights the current line and reveals its English while it speaks. Speakers A and B use different
  French voices when two exist.
- **Mes mots:** Mots / Phrases tabs, search, a **Récents / Par thème** switch (default Récents), English
  blurred until tapped, swipe left to reveal "Supprimer".
- **Réglages:** Vera calendar name (with found / not found), on/off per calendar for keyword detection,
  speech speed (default 0.9×) with a test button, "Recalculer le thème de la semaine".
- **Empty state** for Mes mots and a **missing French voice** sheet.
- Streak: a missed day resets quietly to 1. No onboarding screen: calendar access is granted once
  when `setup()` runs.

## 3. Content additions (adds to original §3)

- Optional `tts` field per entry: the text to speak when the written word mispronounces.
- The library lives in the Sheet (`Themes` and `Entries` tabs) so entries can be fixed by hand. A
  `validate()` function checks 10–14 entries per theme, no duplicate words, and required fields.

## 4. Daily calendar event (new)

Each morning a trigger writes one event with the word and phrase to a **separate "ÉLISE" calendar**
that ÉLISE creates. It never writes to your calendars or Vera's. (This relaxes the original
"never write to calendars" rule, and needs the full calendar scope from that step on.)

## 5. Widget: on hold

No home-screen widget for now; to be revisited.

## 6. Build order (replaces original §8)

1. **Scaffold:** API with sample entry, streak, saving, settings; web app installable on the Pixel. **Checkpoint 1:** [SETUP.md](../SETUP.md).
2. **Content:** Sheet schema + validator, the 52 default-calendar themes first. **Checkpoint 2:** 10 random entries to read *and listen to* on the phone; decide whether the phone voice is good enough.
3. **Theme engine:** Vera / keyword / default logic as pure functions with tests (run locally with Node), Sunday 21:00 trigger. **Checkpoint 3:** test report + 12-week simulation.
4. **Today wired to the engine:** daily pick, seen-entries log (timestamps + counts for v2 spaced repetition).
5. **Daily ÉLISE calendar event.**
6. **Polish.**
