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
- **A finished day** = word played, idiom played, phrase and dialogue heard (Écouter d'abord or Écouter),
  and one line spoken with the mic (skipped on a phone without speech recognition). Revealing the English
  is never required. A progress row on Today shows the steps; when all are done, "Séance terminée" and the
  day is logged once, with the minutes actually spent in the app. Sunday: finished when all 6 words and
  6 idioms have been played.
- Streak and week dots count **finished days only** (the Practice tab), not opens. A missed day resets the
  streak quietly; today not finished yet doesn't break it. No onboarding screen: calendar access is granted once
  when `setup()` runs.

## 3. Content (adds to original §3)

The library lives in the **Elise** Sheet, so you can fix anything by hand; **the Sheet is the master
copy.** New themes are written in the repo (`content/library/<tag>.json`, listed in `INDEX.json`) and
brought in with **`importNewContent()`** (run from the Apps Script editor): it adds only entries and
idioms whose id isn't in the Sheet yet, never changes an existing row, then runs the validator.
`content/library/COMPLETE.txt` lists the finished themes; tests hold those to the full rules.

| Tab | Columns | Notes |
|---|---|---|
| `Themes` | tag, category, name_fr, name_en, related | 65 themes. `related` is comma-separated; the **first** one is the even-year swap and the first cooldown fallback |
| `DefaultCalendar` | week, tag | ISO weeks 1–53 |
| `Keywords` | keyword, target | target is a theme tag, or a category (→ that category's first theme not in cooldown) |
| `Entries` | id, theme, level, word, pos, fem, ipa, def_fr, def_en, example_fr, example_en, phrase_fr, phrase_en, register, register_note, d1_fr … d4_en, tts | Dialogue speakers alternate A, B, A, B. `tts` is optional: what to speak when the word mispronounces |
| `Idioms` | id, theme, idiom_fr, literal, meaning_en, example_fr, example_en | **6 per theme** (≈390 in all), one for each of Mon–Sat; a repeat year reuses them. No idiom is used twice in the library |

`validateContent()` (Apps Script, `Content.js`) and `node --test tests/*.test.js` apply the same rules:
10–14 entries per theme (`validateContent(true)` once the library is complete), no duplicate words
(ignoring the article), required fields, phrase in dialogue line 1 or 2, register starting with
`tu` or `vous`, related tags and keywords pointing to real themes. A word that doesn't appear as-is
in its example (a conjugated verb, say) is a warning, not an error.

Keyword categories beyond the original four: daily and seasonal keywords exist too. Category order
when several events match: **travel > social > errands > work > daily > seasonal**, then the earliest date.

## 3a. Expression du jour (new)

Under the word card, the Today screen shows the day's **idiom**: the expression (with a speaker button), its
word-for-word translation ("Mot à mot : to throw money out of the windows"), its real meaning (blurred until
tapped), and an example sentence (English blurred until tapped). It can be bookmarked; saved idioms appear
in Mes mots › Phrases.

## 3b. The week's rhythm (replaces original §5.5)

| Day | What | Notes |
|---|---|---|
| Mon–Sat | 6 new entries: **4 B1, 1 B2 "Niveau +", 1 argot** | Order shuffled each week (seeded by the week, so it is fixed once the week is locked and the app, the ÉLISE calendar event and "Next" agree) |
| Sun | **Révision** | No new entry: listen-and-recall of the week's 6 |

- Entries have a `level`: `B1`, `B2` (a less common word or subtler structure: *quitte à*, subjunctive, *il aurait fallu*), or `argot`.
- **Argot = widely used familiar French** (*bosser, galère, kiffer, claquer, ça me saoule*), always with a note on
  when not to use it and the neutral equivalent. No trendy verlan, nothing that dates fast.
- Per theme (complete library): 10–14 entries with at least **6 B1, 2 B2, 2 argot**, so a repeat year still has unseen ones.
- Unseen-first and oldest-seen fallback (original §5.4) apply within each level.
- The B2 and argot entries carry a small badge in the app.

## 3c. Immersion (new; app features)

1. **Listen first:** the phrase card opens veiled with **"Écouter d'abord"**: the phrase plays, then the
   dialogue, and then the French text appears (or tap "Lire le texte"). Once a day. Chrome won't play
   speech before a tap, so it can't start by itself. English stays blurred until tapped.
2. **Speak back ("À vous"):** a mic button on the dialogue. You say speaker B's line; Chrome's built-in French
   speech recognition (`fr-FR`) shows what it heard under the target line. No score, no network beyond
   Chrome's own recognition.

3. **Rehearsal before a real event ("Répétition"):** when the week's theme came from a calendar event,
   the day before that event the Today screen offers a 2-minute rehearsal: the theme's 3 most useful
   phrases, then a speak-back role-play of a dialogue where you play yourself.
4. **Shadowing and slow mode:** in the dialogue player, each line plays, then pauses long enough for you
   to repeat it aloud. Long-press any speaker button to replay at 0.7×.
5. **One sentence a day ("Ta phrase"):** a prompt to write or say (speech-to-text) one French sentence
   using the day's word. Saved to a `Sentences` tab; Sunday's review shows the week's sentences.
6. **Weekly listening link:** the `Podcasts` tab lists French podcasts you follow on Spotify
   (title, Spotify link, optional themes or categories, note). Each week the theme banner links to one:
   the first that matches the theme or its category and wasn't used recently, otherwise the next in
   rotation. It opens in Spotify.

## 3c-bis. Level and progress (new; backend only for now)

No level display in the app yet: everything lives in the Sheet's **Config** tab.

- **`level`** (`B1` now): the weekly mix. B1 mode = 4 B1 · 1 B2 · 1 argot; B2 mode = 2 B1 · 3 B2 · 1 argot.
  A theme can run B2 mode only with 6+ B2 entries (none can yet); until then the engine stays in B1 mode.
- **Spaced review**: Sunday's review is a self-test: each word and idiom is rated *Je savais / Pas sûr /
  Je ne savais pas*. Items move through 5 boxes, reviewed after 1, 2, 4, 8 and 16 weeks (knew: up a
  box; unsure: same box; didn't know: back to box 1); box 4–5 = mastered. Up to 6 due items from past
  weeks join each Sunday review ("À revoir"). Stored in the Shown tab (box, due, last_rating,
  last_review, reviews, knew). The day is finished when every item is rated.
- **Speaking**: each line said with the mic is scored against its target (share of words heard,
  0–100); the day's average goes to Practice › `speaking`.
- **Readiness**, checked every Sunday night and after each review, over the last 8 weeks:
  B1 → B2 needs ≥ 8 weeks at B1, ≥ 4 finished days a week, B1 recall ≥ 85 % (≥ 30 reviews),
  B2 recall ≥ 70 % (≥ 10 reviews), speaking ≥ 70 (≥ 10 days; skipped if never measured).
  First-guess thresholds, to tune on real data. Written to Config: `level_readiness` (the numbers),
  `level_suggestion` (only when ready: suggests a TCF/DELF practice test first). **ÉLISE never changes
  `level` itself**: you change it in Config; `level_since` restarts then.

## 3d. Practice log, read by VERA (new)

ÉLISE **writes its own log**, and VERA **reads it**. ÉLISE holds no VERA token and never calls VERA.

- ÉLISE keeps a `Practice` tab, one row per **finished** day:
  `date | language | minutes | sessions | new_items | reviewed | theme | note | updated_at | speaking`.
  The row is written when the day is finished (see §2); finishing again the same day adds minutes and a
  session to that row. Opening the app alone writes nothing here.
- The same format is used by any later language app (German…), each in its own Sheet with its own
  `language` code, so VERA needs one reader for all of them.
- VERA's side is a small nightly reader (`docs/vera/PracticeLogs.js`), proposed as an issue on the VERA
  repository (`docs/vera/ISSUE.md`). It maps each log to a Growth goal through VERA's own Config
  (`practice_logs`); for French, `GOAL-20260309-02`.

## 3e. Ready for other languages (new)

ÉLISE stays a French app, but anything language-specific is a setting, so a German edition can be a
copy with its own Sheet and library rather than a rewrite: `Config › language` (`fr`), the speech voice
(`fr-FR`), the `language` column in the practice log. One app for several languages is a later decision.

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
2. **Default calendar**: the seasonal list by ISO week (original §6), from the Sheet. The even-year swap
   (original §6) applies to every category **except seasonal**: sales, Halloween, réveillon, 14 Juillet and
   the rest always fall in their real season.

Cooldown (§5.4) applies to both; the "priority: high" override is gone with Vera.

**How the engine applies this** (`apps-script/Engine.js`, tested in `tests/engine.test.js`;
a 12-week simulation is in [`checkpoint-3.md`](checkpoint-3.md)):

- **Window:** events dated in the week *after* the theme week (Monday+7 to Sunday+13).
- **Skipped:** recurring and declined events, and single-day all-day birthday reminders. A multi-day
  all-day event (a trip) counts.
- **Matching:** title and location, case- and accent-insensitive, whole words (plural *s* allowed),
  from the `Keywords` tab.
- **One event, several keywords:** a keyword naming a theme beats a category keyword; then category order;
  then the keyword that comes first in the title ("Birthday dinner" is a birthday).
- **Several events:** travel > social > errands > work > daily > seasonal, then the earliest date. An event
  whose theme and related themes are all on cooldown hands over to the next event, then to the default.
- **Default:** the ISO week's theme; in even ISO years, non-seasonal defaults are swapped for their first
  related theme. A default on cooldown falls back to its related themes, then to the free theme used
  longest ago.
- **Only complete themes** (10+ entries with 6 B1, 2 B2, 2 argot, and 6 idioms) can be picked while the
  library is being written. If every complete theme is on cooldown, the cooldown is relaxed and the one
  used longest ago is picked, never an unwritten theme.
- **Storage:** each week is stored in the `ThemeWeeks` tab (week_start, tag, source, why, event_date, plan,
  chosen_at) and stays locked. `rerunThisWeek()` (Réglages › Recalculer) re-picks it.
- **Schedule:** `chooseNextWeek()` runs on a Sunday 21:00 trigger (`installTriggers()`, run once).
- **The `Shown` tab** (id, kind, theme, first_shown, last_shown, times_shown) feeds unseen-first picking and
  later spaced repetition. It is written from step 4.

## 6. Widget: on hold

No home-screen widget for now; to be revisited.

## 7. Build order (replaces original §8)

1. **Scaffold:** API with sample entry, streak, saving, settings; web app installable on the Pixel. **Checkpoint 1:** [SETUP.md](../SETUP.md).
2. **Content:** Sheet schema + validator, the 52 default-calendar themes first. **Checkpoint 2:** 10 random entries to read *and listen to* on the phone; decide whether the phone voice is good enough.
3. **Theme engine:** keyword / default logic as pure functions with tests (run locally with Node), Sunday 21:00 trigger. **Checkpoint 3:** test report + 12-week simulation.
4. ✅ **Today wired to the engine** (`apps-script/Today.js`, tests in `tests/today.test.js`): the week's shuffled 4 B1 / 1 B2 / 1 argot, Sunday review, seen-entries log
   (timestamps + counts for v2 spaced repetition), listen first, speak back, the VERA progress log.
   Then: rehearsal before real events, shadowing and slow mode, one sentence a day, weekly podcast link.
5. **ÉLISE calendar:** one all-day event per theme week.
6. **Polish.**
