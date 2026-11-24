# ÉLISE: current spec

This file records what changed from [`original-spec.md`](original-spec.md) (the first brief) after
the design and platform decisions of 24 Nov 2026. **Where the two disagree, this file wins.**
Sections not mentioned here (content model §3, theme library §4, default calendar §6) still apply
as written, with "the device" read as "the Apps Script API". §5 (weekly theme selection) applies
with the change in §5 below: **no Vera source**.

Design canvas: <https://claude.ai/artifact/H2ZSgRooxsmPRhwDmmJJAW>

## 1. Platform (replaces original §1)

Built like VERA, not as a native Android app.

| | Original | Now |
|---|---|---|
| Front end | Kotlin / Compose APK, sideloaded | Installable web app (PWA) on GitHub Pages, added to the Pixel home screen; opens full-screen with its own icon |
| Logic + scheduling | On device, WorkManager | Standalone **Apps Script** project: JSON API (`doGet`, token-gated) + time-driven triggers |
| Storage | Room / DataStore | The **ÉLISE** Google Sheet: `Config` (key/value settings), `Visits`, `Saved`, later `Themes`, `Entries`, `ThemeWeeks`, `Shown` |
| Calendars | `CalendarContract` on the phone | `CalendarApp` on the server: reads the calendars switched on in Réglages; writes only to its own ÉLISE calendar |
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
- **Réglages:** on/off per calendar for keyword detection,
  speech speed (default 0.9×) with a test button, "Recalculer le thème de la semaine".
- **Empty state** for Mes mots and a **missing French voice** sheet.
- Streak: a missed day resets quietly to 1. No onboarding screen: calendar access is granted once
  when `setup()` runs.

## 3. Content (adds to original §3)

The library lives in the **Elise** Sheet, so you can fix anything by hand. After the first
seeding from `content/*.json`, **the Sheet is the master copy.**

| Tab | Columns | Notes |
|---|---|---|
| `Themes` | tag, category, name_fr, name_en, related | 65 themes. `related` is comma-separated; the **first** one is the even-year swap and the first cooldown fallback |
| `DefaultCalendar` | week, tag | ISO weeks 1–53 |
| `Keywords` | keyword, target | target is a theme tag, or a category (→ that category's first theme not in cooldown) |
| `Entries` | id, theme, word, pos, fem, ipa, def_fr, def_en, example_fr, example_en, phrase_fr, phrase_en, register, register_note, d1_fr … d4_en, tts | Dialogue speakers alternate A, B, A, B. `tts` is optional: what to speak when the word mispronounces |

`validateContent()` (Apps Script, `Content.js`) and `node --test tests/*.test.js` apply the same rules:
10–14 entries per theme (`validateContent(true)` once the library is complete), no duplicate words
(ignoring the article), required fields, phrase in dialogue line 1 or 2, register starting with
`tu` or `vous`, related tags and keywords pointing to real themes. A word that doesn't appear as-is
in its example (a conjugated verb, say) is a warning, not an error.

Keyword categories beyond the original four: daily and seasonal keywords exist too. Category order
when several events match: **travel > social > errands > work > daily > seasonal**, then the earliest date.

## 4. ÉLISE calendar: the theme weeks (new)

ÉLISE creates its own calendar, **ÉLISE**, and writes **one all-day event per theme week (Monday to
Sunday)** when the week is locked, e.g. `FR · Voyage — à l'aéroport`. The description holds why it
was picked ("Dentist on Mar 3" / "Default, week 14") and the week's seven words. It lets you see past
and upcoming themes at a glance in Google Calendar. ÉLISE never reads this calendar back, and never
writes to any other calendar. (This relaxes the original "never write to calendars" rule and needs
the full calendar scope from that step on.)

## 5. Theme sources (replaces original §5.1–5.2)

**Vera plays no part.** VERA is not changed and writes nothing for ÉLISE. Sources, in priority order:

1. **Your calendars**: keyword detection (original §5.3) on every calendar switched on in Réglages,
   mainly **AE&VV - Our Joint Chaos**. Off by default: Holidays in United States, Bills, VERA,
   and the ÉLISE calendar itself (never listed).
2. **Default calendar**: the seasonal list by ISO week (original §6), from the Sheet.

Cooldown (§5.4) applies to both; the "priority: high" override is gone with Vera.

## 6. Widget: on hold

No home-screen widget for now; to be revisited.

## 7. Build order (replaces original §8)

1. **Scaffold:** API with sample entry, streak, saving, settings; web app installable on the Pixel. **Checkpoint 1:** [SETUP.md](../SETUP.md).
2. **Content:** Sheet schema + validator, the 52 default-calendar themes first. **Checkpoint 2:** 10 random entries to read *and listen to* on the phone; decide whether the phone voice is good enough.
3. **Theme engine:** keyword / default logic as pure functions with tests (run locally with Node), Sunday 21:00 trigger. **Checkpoint 3:** test report + 12-week simulation.
4. **Today wired to the engine:** daily pick, seen-entries log (timestamps + counts for v2 spaced repetition).
5. **ÉLISE calendar:** one all-day event per theme week.
6. **Polish.**
