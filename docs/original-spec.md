# ÉLISE — Build Spec for Claude Code

**App name:** ÉLISE (Everyday Language Immersion & Speaking Engine). Use "ÉLISE" as the app label, widget name and launcher name. Package: `com.ahmed.elise`.

> Paste this whole file into Claude Code in an empty folder. Build the app described below, step by step, and stop at each **Checkpoint** so I can review.

## 0. Context

- I'm Ahmed, a B1 French learner (France French). My goal is to grow my everyday vocabulary and improve my conversation skills.
- The app is for **me only**, installed by sideloading an APK on my Android phone. No Play Store, no accounts, no backend, no analytics.
- I don't write Android code. You write all of it and build the APK with **GitHub Actions** so I can download it from the repo's Actions artifacts.
- Everything runs on the device. The only outside input is the phone's synced Google Calendars, read through Android's calendar provider.

## 1. Tech stack

- Kotlin, Jetpack Compose (Material 3), minSdk 26, targetSdk = latest stable.
- Home-screen widget: **Jetpack Glance** (`GlanceAppWidget`).
- Scheduling: **WorkManager**.
- Storage: bundled JSON content in `assets/` plus a small Room database (or DataStore) for state: saved words, streak, theme history, what I've seen.
- Audio: Android **TextToSpeech** with `Locale.FRANCE`. If no French voice is installed, show a one-tap prompt to install it.
- Calendar: `CalendarContract` with the `READ_CALENDAR` permission. Read only, never write.
- CI: `.github/workflows/build.yml` builds a signed release APK on every push to `main` and uploads it as an artifact. Use a debug keystore committed for personal use, or generate a release keystore and store it in GitHub secrets, and tell me which you chose.

## 2. Screens (match the design mockup)

Design: cream background `#F7F4EE`, navy `#1E2A4A`, a terracotta accent `#C8553D` used sparingly, Fraunces (serif) for French text, Inter for UI text. Touch targets at least 44 dp. UI labels are in French.

### 2.1 Home-screen widget (4×3, resizable)
- "Mot du jour": the word, part of speech, a short French definition, and the English gloss underneath.
- Divider, then "Phrase du jour": the phrase in French with English underneath.
- A play button that speaks the phrase **without opening the app**, using a broadcast receiver or small service that runs TTS.
- A flame icon with the streak count in the top-right corner.
- Tapping anywhere else opens the Today screen.
- Refreshes daily at 07:00 local time.

### 2.2 Today screen
1. Header: the date in French ("Lundi 23 novembre") and "Bonjour" or "Bonsoir" depending on the time of day, with the streak chip.
2. **Theme banner:** "Thème de la semaine · N/7", the theme name, and "Next: …" (the next week's theme if it's already known).
3. A row of 7 dots for the week (Monday to Sunday). A dot fills when I opened the app that day.
4. **Word card:** the word (large, serif), a speaker button, IPA, part of speech and feminine form, a **Français / English** toggle for the definition (French is the default), and an example sentence in French with English underneath. A bookmark button saves the word.
5. **Phrase card (dark navy):** the phrase of the day, a speaker button, the English, then a **4-line mini-dialogue** (speakers A and B, French with English under each line), a register note (tu/vous), and an "Écouter le dialogue" button that plays all 4 lines with a short pause between them.
6. Bottom navigation: "Aujourd'hui" and "Mes mots".

### 2.3 Mes mots (saved)
- Tabs: "Mots" and "Phrases".
- A list of cards with the French and English and a speaker button. Swipe to remove.

Streak rule: opening the Today screen (or tapping play on the widget) counts as that day's activity.

## 3. Content model

Each theme is one file: `assets/content/themes/<theme_tag>.json`

```json
{
  "tag": "travel.airport",
  "category": "travel",
  "name_fr": "Voyage — à l'aéroport",
  "name_en": "Travel — at the airport",
  "related": ["travel.hotel", "travel.train"],
  "entries": [
    {
      "id": "travel.airport.01",
      "word": "l'embarquement",
      "pos": "nom masc.",
      "fem": null,
      "ipa": "/lɑ̃.baʁ.kə.mɑ̃/",
      "def_fr": "Moment où les passagers montent dans l'avion.",
      "def_en": "Boarding.",
      "example_fr": "L'embarquement commence trente minutes avant le départ.",
      "example_en": "Boarding starts thirty minutes before departure.",
      "phrase_fr": "Excusez-moi, c'est bien la porte pour Paris ?",
      "phrase_en": "Excuse me, is this the right gate for Paris?",
      "register": "vous — polite, with staff",
      "dialogue": [
        {"who": "A", "fr": "Excusez-moi, c'est bien la porte pour Paris ?", "en": "Excuse me, is this the right gate for Paris?"},
        {"who": "B", "fr": "Oui, mais l'embarquement est retardé de vingt minutes.", "en": "Yes, but boarding is delayed by twenty minutes."},
        {"who": "A", "fr": "D'accord. On sera appelés par rangée ?", "en": "OK. Will we be called by row?"},
        {"who": "B", "fr": "Oui, écoutez les annonces, ça ne devrait pas tarder.", "en": "Yes, listen for the announcements, it shouldn't be long."}
      ]
    }
  ]
}
```

Content rules (apply to every entry):
- B1 level, natural **France French**, the way people actually speak. No textbook phrasing.
- Each theme has **10–14 entries**, so a repeated theme still has unseen material.
- The word should appear in its own example sentence. The phrase should appear as line 1 or 2 of the dialogue.
- Mix registers within a theme and label each one: tu (friends), vous (strangers, staff, work).
- No duplicate words anywhere in the library.
- Add `assets/content/index.json` listing every theme tag, its category and its related tags.

## 4. Theme library (tags)

Categories: `travel`, `social`, `errands`, `work`, `daily`, `seasonal`.

Create at least these tags (≈60):

- **travel:** airport, hotel, train, car_rental, directions, museum, restaurant_abroad, holiday_prep, souvenirs, beach
- **social:** cafe_friends, hosting_dinner, birthday_party, family_intros, family_visit, neighbours, couple_outing, phone_catchup, compliments_thanks, small_talk_weather
- **errands:** doctor, dentist, pharmacy, bank, landlord, car_garage, post_office, haircut, insurance, emergency
- **work:** meetings, presentations, emails, negotiation, feedback, deadlines, interview, networking, offsite, small_talk_office
- **daily:** grocery_market, cooking, home_chores, gym_sport, transport_metro, clothes_shopping, phone_tech, tv_series, music, nature_hiking
- **seasonal:** new_year_resolutions, winter_snow, ski, spring_garden, summer_heat, fete_nationale, fete_musique, back_to_school, autumn, halloween, gifts, sales, december_holidays, holiday_travel, year_review

## 5. Weekly theme selection

Runs every **Sunday at 21:00** (WorkManager) for the week starting the next Monday. It also runs on first launch for the current week. The theme is **locked Monday to Sunday**.

### 5.1 Sources, in priority order
1. **Vera's calendar**: explicit instructions (see 5.2).
2. **My own calendars**: keyword detection on one-off events (see 5.3).
3. **Default calendar**: the seasonal list by week number (see 6).

### 5.2 Vera's calendar format
- Calendar name: **`Vera · French`** (exact match; let me change it in a settings screen).
- One **all-day event** covering the theme week (Monday to Sunday). Vera handles the one-week lead time itself.
- Title: `FR · <any human label>`
- Description, one `key: value` per line:
  ```
  fr_theme: travel.airport
  priority: high          # high | normal
  reason: Paris trip Mar 14
  event_date: 2027-03-14
  ```
- If `fr_theme` isn't a known tag, use the closest tag in the same category (match on the prefix before the dot). If there's no match, ignore the event.
- If several Vera events overlap the same week, take the one with the highest priority, then the earliest `event_date`.

### 5.3 Keyword detection on my calendars (fallback)
- Read every synced calendar **except** `Vera · French`. Look **7–14 days ahead** (the week after next starts, so the theme lands the week before the event).
- **Skip** recurring events (`RRULE` set), events I've declined, and all-day reminders such as birthdays.
- Match the title and location, case-insensitive, in English or French:
  - **travel:** flight, airport, hotel, airbnb, trip, train, vacation, check-in, vol, voyage, aéroport
  - **social:** dinner, lunch with, party, visit, birthday, hosting, brunch, wedding, dîner, fête
  - **errands:** dr., doctor, dentist, appointment, appt, bank, pharmacy, mechanic, car service, landlord, lease, haircut, rdv, médecin
  - **work:** presentation, review, interview, offsite, workshop, conference, pitch, présentation
- If several match, use the category order **travel > social > errands > work**, then the earliest date.
- Map the matched keyword to a specific tag when possible (dentist → errands.dentist, flight → travel.airport). Otherwise use the category's first tag that isn't in cooldown.

### 5.4 Cooldown and repeats
- **8-week cooldown** per tag.
- A Vera event with `priority: high` **ignores** the cooldown.
- A Vera event with `priority: normal`, or a keyword match, that hits a cooldown → try that tag's `related` tags → if none are available, use the default week.
- Inside a repeated theme, show **only entries I haven't seen**. If all have been seen, show the ones I saw longest ago.
- The default calendar also follows the cooldown. If the default week's tag is in cooldown, use its first available related tag.

### 5.5 Daily pick within the week
- Day N of the week shows entry N from the theme's unseen pool, in a fixed order for the week, so the "Next" preview and the widget stay consistent.
- Log every theme week and every entry shown, so cooldown and "unseen" logic work across years.

## 6. Default calendar (by ISO week)

| Wk | Tag | Wk | Tag |
|---|---|---|---|
| 1 | seasonal.new_year_resolutions | 27 | travel.train |
| 2 | daily.gym_sport | 28 | seasonal.fete_nationale |
| 3 | seasonal.winter_snow | 29 | travel.museum |
| 4 | daily.home_chores | 30 | travel.car_rental |
| 5 | daily.cooking | 31 | errands.pharmacy |
| 6 | social.couple_outing | 32 | seasonal.summer_heat |
| 7 | seasonal.ski | 33 | travel.souvenirs |
| 8 | errands.doctor | 34 | seasonal.back_to_school |
| 9 | errands.bank | 35 | work.deadlines |
| 10 | work.meetings | 36 | work.emails |
| 11 | daily.transport_metro | 37 | errands.landlord |
| 12 | seasonal.spring_garden | 38 | seasonal.autumn |
| 13 | daily.clothes_shopping | 39 | social.cafe_friends |
| 14 | travel.airport | 40 | daily.phone_tech |
| 15 | travel.hotel | 41 | work.negotiation |
| 16 | travel.restaurant_abroad | 42 | daily.tv_series |
| 17 | daily.grocery_market | 43 | social.hosting_dinner |
| 18 | social.family_intros | 44 | seasonal.halloween |
| 19 | social.neighbours | 45 | errands.dentist |
| 20 | work.presentations | 46 | errands.car_garage |
| 21 | daily.nature_hiking | 47 | social.family_visit |
| 22 | social.birthday_party | 48 | seasonal.sales |
| 23 | travel.beach | 49 | seasonal.gifts |
| 24 | social.small_talk_weather | 50 | seasonal.december_holidays |
| 25 | seasonal.fete_musique | 51 | seasonal.holiday_travel |
| 26 | travel.holiday_prep | 52 | seasonal.year_review |

Week 53 (in years that have one) → `seasonal.year_review`.
**Year-over-year variety:** in even years, swap each default tag for its first `related` tag, if that tag isn't in cooldown.

## 7. Settings (one simple screen)
- Vera calendar name (default `Vera · French`).
- A switch to include or exclude each of my synced calendars from keyword detection.
- Widget refresh time (default 07:00).
- A "Re-run this week's theme" button for testing. It ignores the lock.
- A "Why this theme?" line on the Today screen's theme banner that shows the source: Vera (with its reason), Calendar ("Dentist on Mar 3"), or Default.

## 8. Build order and checkpoints

1. **Scaffold:** the project, the GitHub Actions workflow, and an empty app that installs.
   **Checkpoint 1:** tell me how to download and install the APK. Include the steps for Android's unverified-developer install flow and/or `adb install`.
2. **Content:** the schema and validator (unit test: every theme has 10–14 entries, no duplicate words, every required field present). Generate the **52 default-calendar themes first**, then the rest.
   **Checkpoint 2:** show me 10 random entries to spot-check before generating everything.
3. **Screens:** Today, Mes mots, and Settings with local state, streak and saving.
4. **Widget:** the Glance widget, daily refresh, and play-from-widget.
5. **Theme engine:** the Vera, keyword and default logic in its own pure-Kotlin class, with **unit tests** for every rule in section 5 (cooldown, high-priority override, related fallback, recurring skip, category order, unseen entries, week lock).
   **Checkpoint 3:** a test report plus a short table simulating 12 weeks with sample Vera and calendar events.
6. **Polish:** a TTS-missing prompt, the calendar permission flow (if permission is denied, everything still works using the default calendar), and an empty-state for no saved words.

## 9. Non-goals (don't build)
- No accounts, cloud sync, ads, analytics or network calls.
- No writing to calendars.
- No points, badges or leaderboards; the streak counter is enough.
- No grammar lessons or quizzes in v1. A spaced-repetition review is planned for v2, so keep the "seen entries" log rich enough to support it (timestamps, how many times each entry was shown).
