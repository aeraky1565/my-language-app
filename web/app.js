/* ÉLISE — web app. Talks to the ÉLISE Apps Script API (see apps-script/Code.js). */
'use strict';

// ---------------------------------------------------------------------------
// Connection (kept only on this phone)
// ---------------------------------------------------------------------------

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// A link like …/#api=<web app url>&token=<token> connects the phone in one tap.
(function readConnectLink() {
  if (!location.hash.includes('token=')) return;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('api')) store.set('elise.api', h.get('api'));
  if (h.get('token')) store.set('elise.token', h.get('token'));
  history.replaceState(null, '', location.pathname + location.search);
})();

async function api(action, payload, opts = {}) {
  const base = store.get('elise.api');
  const token = store.get('elise.token');
  if (!base || !token) throw new Error('not_connected');
  const url = new URL(base);
  url.searchParams.set('action', action);
  url.searchParams.set('token', token);
  if (payload) url.searchParams.set('p', JSON.stringify(payload));
  const res = await fetch(url.toString(), { redirect: 'follow', keepalive: !!opts.keepalive });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'error');
  return body.data;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  view: 'today',
  today: null,
  revealed: new Set(),
  dialogueOpen: false,
  playIndex: -1,
  saved: null,
  tab: 'word',
  sort: 'recent',
  query: '',
  settings: null,
  listenRunning: false,
  heard: {},
  micLine: -1
};

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const listenedToday = () => state.today && store.get('elise.listened') === state.today.date;

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.7 2.2-4.8.2 1.6 1 2.6 2 3C11 8.5 11 5 12 2z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
};

// ---------------------------------------------------------------------------
// Speech (Chrome on the Pixel uses Google's French voices)
// ---------------------------------------------------------------------------

const tts = {
  voices: [],
  loaded: false,
  load() {
    if (!('speechSynthesis' in window)) return;
    const all = speechSynthesis.getVoices();
    if (all.length) this.loaded = true;
    this.voices = all.filter((v) => /^fr[-_]FR/i.test(v.lang));
    this.voices.sort((a, b) => Number(b.localService) - Number(a.localService));
  },
  rate() { return Number(state.today && state.today.tts_rate) || 0.9; },
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
  /** Speaks text; speaker 1 uses a second voice when there is one. Resolves when done. */
  say(text, speaker = 0) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { showSheet(); return resolve(false); }
      this.load();
      if (this.loaded && !this.voices.length) { showSheet(); return resolve(false); }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      const v = this.voices[speaker % Math.max(this.voices.length, 1)];
      if (v) u.voice = v;
      if (speaker === 1 && this.voices.length < 2) u.pitch = 1.15;
      u.rate = this.rate();
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
    });
  }
};
if ('speechSynthesis' in window) {
  tts.load();
  speechSynthesis.addEventListener('voiceschanged', () => tts.load());
}

function showSheet() { document.getElementById('sheet').hidden = false; }
document.getElementById('sheet-ok').addEventListener('click', () => { document.getElementById('sheet').hidden = true; });
document.getElementById('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') e.currentTarget.hidden = true; });

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

async function speakButton(btn, text, speaker) {
  btn.classList.add('busy');
  tts.stop();
  await tts.say(text, speaker);
  btn.classList.remove('busy');
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function go(view) {
  tts.stop();
  state.playIndex = -1;
  state.view = view;
  $nav.querySelectorAll('.nav-item').forEach((b) => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  render();
  if (view === 'today') loadToday();
  if (view === 'words') loadSaved();
  if (view === 'settings') loadSettings();
}
$nav.addEventListener('click', (e) => { const b = e.target.closest('.nav-item'); if (b) go(b.dataset.view); });

function render() {
  const connected = store.get('elise.api') && store.get('elise.token');
  $nav.hidden = !connected || state.view === 'settings';
  if (!connected) return renderConnect();
  if (state.view === 'today') return renderToday();
  if (state.view === 'words') return renderWords();
  if (state.view === 'settings') return renderSettings();
}

function fail(err) {
  if (String(err.message) === 'unauthorized') {
    store.del('elise.token');
    render();
    return toast('Clé d’accès refusée. Reconnectez ÉLISE.');
  }
  toast('Connexion impossible. Réessayez dans un instant.');
  console.error(err);
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

function renderConnect(error) {
  $view.className = 'connect';
  $view.innerHTML = `
    <p class="brand">ÉLISE</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <h1>Connecter ÉLISE</h1>
      <p class="muted" style="font-size:16px;line-height:1.55">Collez l’adresse de l’application web Apps Script et la clé d’accès affichées par <b>setup()</b>. Elles restent sur ce téléphone.</p>
    </div>
    <form id="connect">
      <label>Adresse de l’application web<input class="field" name="api" type="url" required placeholder="https://script.google.com/macros/s/…/exec" value="${esc(store.get('elise.api') || '')}"></label>
      <label>Clé d’accès<input class="field" name="token" required autocomplete="off" spellcheck="false"></label>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <button class="btn btn-solid" type="submit">Se connecter</button>
    </form>`;
  document.getElementById('connect').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    store.set('elise.api', String(f.get('api')).trim());
    store.set('elise.token', String(f.get('token')).trim());
    try {
      await api('ping');
      go('today');
    } catch (err) {
      store.del('elise.token');
      renderConnect(err.message === 'unauthorized' ? 'Clé d’accès incorrecte.' : 'Adresse injoignable. Vérifiez qu’elle se termine par /exec.');
    }
  });
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

async function loadToday() {
  try {
    state.today = await api('today');
    if (state.view === 'today') renderToday();
  } catch (err) { fail(err); }
}

function frenchDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function en(key, text, cls = '') {
  const shown = state.revealed.has(key) || (key.startsWith('d') && state.playIndex === Number(key.slice(1)));
  return `<button type="button" class="en ${cls} ${shown ? '' : 'hidden'}" data-reveal="${key}" ${shown ? '' : 'aria-label="Afficher la traduction anglaise"'}>${esc(text)}</button>`;
}

function highlight(sentence, word) {
  const s = esc(sentence);
  const w = esc(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return w ? s.replace(new RegExp(w, 'i'), (m) => `<mark>${m}</mark>`) : s;
}

function topHtml(t) {
  const hour = new Date().getHours();
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) =>
    `<span class="day ${t.week[i] ? 'done' : ''} ${i === t.todayIndex ? 'today' : ''}"><i></i>${l}</span>`).join('');
  return `
    <header class="header">
      <div>
        <p class="date">${esc(frenchDate(t.date))}</p>
        <h1>${hour >= 18 || hour < 4 ? 'Bonsoir' : 'Bonjour'}</h1>
      </div>
      <div class="header-actions">
        <span class="streak" aria-label="Série : ${t.streak} jours">${ICON.flame}${t.streak}</span>
        <button class="icon-btn" type="button" data-go="settings" aria-label="Réglages">${ICON.sliders}</button>
      </div>
    </header>

    <section class="banner">
      <div class="row-between">
        <p class="eyebrow accent">Thème de la semaine · ${t.todayIndex + 1}/7</p>
        ${t.theme.next_name_fr ? `<p class="muted" style="font-size:12px">Next : ${esc(t.theme.next_name_fr)}</p>` : ''}
      </div>
      <h2>${esc(t.theme.name_fr)}</h2>
      <div class="week" aria-label="Jours ouverts cette semaine">${days}</div>
      <p class="why"><b>Pourquoi ce thème ?</b> ${esc(t.theme.why)}</p>
      ${t.sample ? '<p class="small">Exemple intégré : le contenu arrive après <b>importNewContent()</b>.</p>' : ''}
    </section>`;
}

function levelBadge(level) {
  if (level === 'B2') return '<span class="badge b2">Niveau +</span>';
  if (level === 'argot') return '<span class="badge argot">Argot</span>';
  return '';
}

function renderToday() {
  $view.className = '';
  const t = state.today;
  if (!t) {
    $view.innerHTML = '<div class="skeleton" style="height:72px"></div><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:380px"></div>';
    return;
  }
  if (t.mode === 'review') return renderReview(t);
  const e = t.entry;
  const playing = state.playIndex >= 0;
  const veiled = !listenedToday();
  $view.innerHTML = `
    ${topHtml(t)}

    <section class="card">
      <div class="row-between">
        <p class="eyebrow">Mot du jour ${levelBadge(e.level)}</p>
        <button class="icon-btn card-head ${t.saved.word ? 'saved' : ''}" style="${t.saved.word ? 'color:var(--accent)' : ''}" type="button" data-save="word" aria-pressed="${t.saved.word}" aria-label="${t.saved.word ? 'Retirer de Mes mots' : 'Enregistrer le mot'}">${ICON.bookmark}</button>
      </div>
      <div class="word-line">
        <h3 class="word">${esc(e.word)}</h3>
        <button class="speak" type="button" data-say="word" aria-label="Écouter le mot">${ICON.speaker}</button>
      </div>
      <div class="tags">
        <span class="ipa">${esc(e.ipa)}</span>
        <span class="tag">${esc(e.pos)}</span>
        ${e.fem ? `<span class="tag">fém. ${esc(e.fem)}</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <p class="def">${esc(e.def_fr)}</p>
        ${en('gloss', e.def_en, 'lg')}
      </div>
      <div class="example">
        <p class="eyebrow" style="font-size:11px">Exemple</p>
        <p class="fr">${highlight(e.example_fr, e.word)}</p>
        ${en('example', e.example_en)}
      </div>
      <p class="hint">Touchez l’anglais flouté pour le révéler.</p>
    </section>

    ${t.idiom && t.idiom.fr ? `
    <section class="card idiom-card">
      <div class="row-between">
        <p class="eyebrow">Expression du jour</p>
        <button class="icon-btn card-head ${t.saved.idiom ? 'saved' : ''}" style="${t.saved.idiom ? 'color:var(--accent)' : ''}" type="button" data-save="idiom" aria-pressed="${!!t.saved.idiom}" aria-label="${t.saved.idiom ? 'Retirer l’expression' : 'Enregistrer l’expression'}">${ICON.bookmark}</button>
      </div>
      <div class="word-line">
        <h3 class="idiom">${esc(t.idiom.fr)}</h3>
        <button class="speak ghost" type="button" data-say="idiom" aria-label="Écouter l’expression">${ICON.speaker}</button>
      </div>
      <p class="literal"><span>Mot à mot :</span> ${esc(t.idiom.literal)}</p>
      ${en('idiom', t.idiom.en, 'lg')}
      <div class="example">
        <p class="fr">${esc(t.idiom.example_fr)}</p>
        ${en('idiomEx', t.idiom.example_en)}
      </div>
    </section>` : ''}

    <section class="phrase-card ${veiled ? 'veiled' : ''}">
      <div class="row-between">
        <p class="eyebrow coral">Phrase du jour</p>
        <button class="icon-btn card-head ${t.saved.phrase ? 'saved' : ''}" style="${t.saved.phrase ? 'color:var(--coral)' : ''}" type="button" data-save="phrase" aria-pressed="${t.saved.phrase}" aria-label="${t.saved.phrase ? 'Retirer la phrase' : 'Enregistrer la phrase'}">${ICON.bookmark}</button>
      </div>
      ${veiled && !state.listenRunning ? `
      <div class="listen-first">
        <button class="btn btn-coral" type="button" data-listen-first>${ICON.play}Écouter d’abord</button>
        <button class="link" type="button" data-show-text>Lire le texte</button>
      </div>` : ''}
      <div class="phrase-line">
        <div>
          <p class="phrase">${esc(e.phrase_fr)}</p>
          ${en('phrase', e.phrase_en, 'lg')}
          <span class="reg">${esc(e.register)}</span>
        </div>
        <button class="speak accent" type="button" data-say="phrase" aria-label="Écouter la phrase">${ICON.speaker}</button>
      </div>
      <div class="dlg-bar">
        <button class="dlg-toggle" type="button" data-toggle-dialogue aria-expanded="${state.dialogueOpen}">
          <span>Mini-dialogue <span>· ${e.dialogue.length} répliques</span></span>${ICON.chevron}
        </button>
        <button class="listen" type="button" data-play aria-label="${playing ? 'Arrêter le dialogue' : 'Écouter le dialogue'}">${playing ? ICON.pause : ICON.play}<span>Écouter</span></button>
      </div>
      ${state.dialogueOpen ? `
      <div class="dialogue ${playing ? 'playing' : ''}">
        ${SpeechRec && !veiled ? '<p class="small on-card">À vous : touchez le micro et dites la réplique B.</p>' : ''}
        ${e.dialogue.map((l, i) => `
          <div class="line ${i === state.playIndex ? 'current' : ''}">
            <span class="who ${l.who === 'B' ? 'b' : ''}">${esc(l.who)}</span>
            <div>
              <p class="fr">${esc(l.fr)}</p>${en('d' + i, l.en)}
              ${state.heard[i] ? `<p class="heard">Entendu : « ${esc(state.heard[i])} »</p>` : ''}
            </div>
            ${SpeechRec && l.who === 'B' && !veiled ? `<button class="mic ${state.micLine === i ? 'on' : ''}" type="button" data-mic="${i}" aria-label="À vous : dites cette réplique">${ICON.mic}</button>` : ''}
          </div>`).join('')}
        <p class="note"><b>Registre :</b> ${esc(e.register_note)}</p>
      </div>` : ''}
    </section>`;
}

function renderReview(t) {
  const r = t.review;
  $view.innerHTML = `
    ${topHtml(t)}
    <section class="card">
      <p class="eyebrow">Révision de la semaine</p>
      <p class="muted" style="font-size:15px;line-height:1.5">Les six mots, phrases et expressions de la semaine. Écoutez, répétez, puis vérifiez l’anglais.</p>
      <div class="review-list">
        ${r.entries.map((x) => `
          <div class="review-item">
            <div>
              <p class="review-word">${esc(x.word)} ${levelBadge(x.level)}</p>
              ${en('rw:' + x.id, x.def_en)}
              <p class="fr">${esc(x.phrase_fr)}</p>
              ${en('rp:' + x.id, x.phrase_en)}
            </div>
            <button class="speak ghost" type="button" data-speak-text="${esc(x.word + '. ' + x.phrase_fr)}" aria-label="Écouter">${ICON.speaker}</button>
          </div>`).join('')}
      </div>
    </section>
    <section class="card idiom-card">
      <p class="eyebrow">Les expressions de la semaine</p>
      <div class="review-list">
        ${r.idioms.map((x) => `
          <div class="review-item">
            <div>
              <p class="review-word">${esc(x.fr)}</p>
              ${en('ri:' + x.id, x.en)}
            </div>
            <button class="speak ghost" type="button" data-speak-text="${esc(x.fr)}" aria-label="Écouter">${ICON.speaker}</button>
          </div>`).join('')}
      </div>
    </section>`;
}

$view.addEventListener('click', async (ev) => {
  const el = ev.target.closest('button, a');
  if (!el) return;

  if (el.dataset.reveal) { state.revealed.add(el.dataset.reveal); el.classList.remove('hidden'); el.removeAttribute('aria-label'); return; }
  if (el.dataset.go) return go(el.dataset.go);

  if (state.view === 'today' && state.today) {
    const e = state.today.entry;
    if (el.dataset.say === 'word') return speakButton(el, e.tts || e.word);
    if (el.dataset.say === 'phrase') return speakButton(el, e.phrase_fr);
    if (el.dataset.say === 'idiom') return speakButton(el, state.today.idiom.fr + '. ' + state.today.idiom.example_fr);
    if (el.dataset.speakText) return speakButton(el, el.dataset.speakText);
    if ('listenFirst' in el.dataset) return listenFirst();
    if ('showText' in el.dataset) { store.set('elise.listened', state.today.date); return renderToday(); }
    if (el.dataset.mic) return speakBack(Number(el.dataset.mic));
    if ('toggleDialogue' in el.dataset) { state.dialogueOpen = !state.dialogueOpen; return renderToday(); }
    if ('play' in el.dataset) return togglePlay();
    if (el.dataset.save) return toggleSave(el.dataset.save);
  }
});

/** Listen first: the phrase, then the dialogue, before the French text is shown. */
async function listenFirst() {
  const e = state.today.entry;
  state.listenRunning = true;
  state.dialogueOpen = true;
  renderToday();
  tts.stop();
  let ok = await tts.say(e.phrase_fr);
  for (let i = 0; ok && i < e.dialogue.length; i++) {
    await new Promise((r) => setTimeout(r, 650));
    ok = await tts.say(e.dialogue[i].fr, e.dialogue[i].who === 'B' ? 1 : 0);
  }
  state.listenRunning = false;
  if (ok) store.set('elise.listened', state.today.date);
  renderToday();
}

/** Speak back: you say line i; Chrome's French recognition shows what it heard. */
function speakBack(i) {
  if (!SpeechRec || state.micLine >= 0) return;
  tts.stop();
  const rec = new SpeechRec();
  rec.lang = 'fr-FR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  state.micLine = i;
  renderToday();
  rec.onresult = (ev) => { state.heard[i] = ev.results[0][0].transcript; };
  rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Autorisez le micro pour ÉLISE dans Chrome.'); };
  rec.onend = () => { state.micLine = -1; renderToday(); };
  try { rec.start(); } catch (err) { state.micLine = -1; renderToday(); }
}

let playRun = 0;
async function togglePlay() {
  if (state.playIndex >= 0) { playRun++; tts.stop(); state.playIndex = -1; return renderToday(); }
  const run = ++playRun;
  const lines = state.today.entry.dialogue;
  state.dialogueOpen = true;
  tts.stop();
  for (let i = 0; i < lines.length; i++) {
    if (run !== playRun) return;
    state.playIndex = i;
    renderToday();
    const ok = await tts.say(lines[i].fr, lines[i].who === 'B' ? 1 : 0);
    if (!ok || run !== playRun) break;
    await new Promise((r) => setTimeout(r, 650));
  }
  if (run === playRun) { state.playIndex = -1; renderToday(); }
}

async function toggleSave(type) {
  const t = state.today, e = t.entry;
  const item = type === 'word'
    ? { type, entry_id: e.id, fr: e.fem ? `${e.word}, ${e.fem}` : e.word, en: e.def_en, theme: t.theme.name_fr }
    : type === 'idiom'
      ? { type, entry_id: t.idiom.id, fr: t.idiom.fr, en: t.idiom.en, theme: t.theme.name_fr }
      : { type, entry_id: e.id, fr: e.phrase_fr, en: e.phrase_en, theme: t.theme.name_fr };
  t.saved[type] = !t.saved[type]; // optimistic
  renderToday();
  try {
    const r = await api('toggle_saved', item);
    t.saved[type] = r.saved;
    state.saved = null;
    toast(r.saved ? 'Enregistré dans Mes mots' : 'Retiré de Mes mots');
  } catch (err) {
    t.saved[type] = !t.saved[type];
    fail(err);
  }
  renderToday();
}

// ---------------------------------------------------------------------------
// Mes mots
// ---------------------------------------------------------------------------

async function loadSaved() {
  try {
    state.saved = await api('saved');
    if (state.view === 'words') renderWords();
  } catch (err) { fail(err); }
}

function renderWords() {
  $view.className = '';
  const all = state.saved;
  const words = (all || []).filter((x) => x.type === 'word');
  const phrases = (all || []).filter((x) => x.type === 'phrase' || x.type === 'idiom');
  const q = state.query.trim().toLowerCase();
  let items = (state.tab === 'word' ? words : phrases).filter((x) => !q || `${x.fr} ${x.en}`.toLowerCase().includes(q));

  let body;
  if (!all) {
    body = '<div class="skeleton" style="height:76px"></div><div class="skeleton" style="height:76px"></div><div class="skeleton" style="height:76px"></div>';
  } else if (!words.length && !phrases.length) {
    body = `<div class="empty">
      <div class="empty-icon">${ICON.bookmark}</div>
      <h2>Rien pour l’instant</h2>
      <p>Touchez le marque-page sur le mot, l’expression ou la phrase du jour pour les retrouver ici.</p>
      <button class="btn btn-solid" type="button" data-go="today">Voir le mot du jour</button>
    </div>`;
  } else if (!items.length) {
    body = `<p class="muted" style="text-align:center;padding:32px 0">${q ? 'Aucun résultat.' : (state.tab === 'word' ? 'Aucun mot enregistré.' : 'Aucune phrase enregistrée.')}</p>`;
  } else {
    const card = (x) => `
      <div class="swipe">
        <button class="delete" type="button" data-remove="${esc(x.id)}">${ICON.trash}Supprimer</button>
        <div class="item ${x.type === 'phrase' ? 'phrase-item' : ''}" data-swipe>
          <div>
            <p class="fr">${esc(x.fr)}</p>
            ${en('s:' + x.id, x.en)}
            ${state.sort === 'recent' && x.theme ? `<span class="theme">${esc(x.theme)}</span>` : ''}
          </div>
          <button class="speak ghost" type="button" data-speak-text="${esc(x.fr)}" aria-label="Écouter">${ICON.speaker}</button>
        </div>
      </div>`;
    if (state.sort === 'theme') {
      const order = [], groups = {};
      items.forEach((x) => { const k = x.theme || '—'; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
      body = order.map((k) => `<p class="eyebrow group">${esc(k)}</p>${groups[k].map(card).join('')}`).join('');
    } else {
      body = items.map(card).join('');
    }
    body += '<p class="small" style="text-align:center;margin-top:6px">Glissez une carte vers la gauche pour la retirer.</p>';
  }

  $view.innerHTML = `
    <h1 class="page-title">Mes mots</h1>
    <div class="tabs" role="tablist" aria-label="Type">
      <button class="tab" role="tab" type="button" data-tab="word" aria-selected="${state.tab === 'word'}">Mots · ${words.length}</button>
      <button class="tab" role="tab" type="button" data-tab="phrase" aria-selected="${state.tab === 'phrase'}">Phrases · ${phrases.length}</button>
    </div>
    <div class="tools">
      <label class="search">${ICON.search}<span class="sr-only">Rechercher</span><input id="q" type="search" placeholder="Rechercher" value="${esc(state.query)}"></label>
      <div class="seg" role="group" aria-label="Trier">
        <button type="button" data-sort="recent" aria-pressed="${state.sort === 'recent'}">Récents</button>
        <button type="button" data-sort="theme" aria-pressed="${state.sort === 'theme'}">Par thème</button>
      </div>
    </div>
    <div class="list">${body}</div>`;

  const input = document.getElementById('q');
  input.addEventListener('input', () => {
    state.query = input.value;
    const pos = input.selectionStart;
    renderWords();
    const again = document.getElementById('q');
    again.focus();
    again.setSelectionRange(pos, pos);
  });
  bindSwipes();
}

$view.addEventListener('click', async (ev) => {
  if (state.view !== 'words') return;
  const el = ev.target.closest('button');
  if (!el) return;
  if (el.dataset.tab) { state.tab = el.dataset.tab; return renderWords(); }
  if (el.dataset.sort) { state.sort = el.dataset.sort; return renderWords(); }
  if (el.dataset.speakText) return speakButton(el, el.dataset.speakText);
  if (el.dataset.remove) {
    const id = el.dataset.remove;
    const before = state.saved;
    state.saved = state.saved.filter((x) => x.id !== id);
    renderWords();
    try {
      await api('remove_saved', { id });
      if (state.today && state.today.entry && id.startsWith(state.today.entry.id + ':')) state.today.saved[id.split(':').pop()] = false;
    } catch (err) { state.saved = before; renderWords(); fail(err); }
  }
});

function bindSwipes() {
  $view.querySelectorAll('[data-swipe]').forEach((card) => {
    let x0 = null, dx = 0, open = false;
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      x0 = e.clientX; dx = 0; card.classList.add('dragging');
    });
    card.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      dx = Math.max(-120, Math.min(0, e.clientX - x0 + (open ? -96 : 0)));
      card.style.transform = `translateX(${dx}px)`;
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null; card.classList.remove('dragging');
      open = dx < -48;
      card.style.transform = open ? 'translateX(-96px)' : '';
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  });
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

async function loadSettings() {
  try {
    state.settings = await api('settings');
    if (state.view === 'settings') renderSettings();
  } catch (err) { fail(err); }
}

function renderSettings() {
  $view.className = '';
  const s = state.settings;
  const voices = tts.voices.length;
  $view.innerHTML = `
    <div class="back-title">
      <button class="icon-btn" type="button" data-go="today" aria-label="Retour">${ICON.back}</button>
      <h1>Réglages</h1>
    </div>
    ${!s ? '<div class="skeleton" style="height:140px"></div><div class="skeleton" style="height:240px"></div>' : `
    <section class="section">
      <h2>Agendas lus pour choisir le thème</h2>
      <div class="panel">
        ${s.calendars.map((c) => `
          <div class="cal">
            <span class="swatch" style="background:${esc(c.color)}"></span>
            <span class="name">${esc(c.name)}</span>
            <button class="switch" type="button" role="switch" aria-checked="${c.included}" aria-label="${esc(c.name)}" data-cal="${esc(c.id)}"><i></i></button>
          </div>`).join('')}
      </div>
      <p class="small">Lecture seule. Les événements récurrents, refusés et les anniversaires sont ignorés.</p>
    </section>
    <section class="section">
      <h2>Voix</h2>
      <div class="panel pad">
        <label for="rate">Vitesse de lecture · <span id="rate-v">${Number(s.tts_rate).toFixed(2)}×</span></label>
        <div class="rate">
          <input id="rate" type="range" min="0.6" max="1.2" step="0.05" value="${esc(s.tts_rate)}">
          <button class="speak ghost" type="button" data-test-voice aria-label="Tester la voix">${ICON.speaker}</button>
        </div>
        <p class="status ${voices ? 'ok' : 'warn'}">${voices ? ICON.check + `${voices} voix française${voices > 1 ? 's' : ''} disponible${voices > 1 ? 's' : ''}` : ICON.alert + 'Aucune voix française détectée'}</p>
      </div>
    </section>
    <section class="section">
      <h2>Test</h2>
      <button class="btn btn-outline" type="button" data-rerun>Recalculer le thème de la semaine</button>
      <p class="small">Ignore le verrouillage du lundi au dimanche : relit vos agendas maintenant.</p>
      <button class="btn btn-outline" type="button" data-disconnect>Déconnecter ce téléphone</button>
    </section>`}`;

  if (!s) return;
  const rate = document.getElementById('rate');
  rate.addEventListener('input', () => { document.getElementById('rate-v').textContent = Number(rate.value).toFixed(2) + '×'; if (state.today) state.today.tts_rate = Number(rate.value); });
  rate.addEventListener('change', async () => {
    try { state.settings = await api('save_settings', { tts_rate: rate.value }); toast('Enregistré'); } catch (err) { fail(err); }
  });
}

$view.addEventListener('click', async (ev) => {
  if (state.view !== 'settings') return;
  const el = ev.target.closest('button');
  if (!el) return;
  if ('testVoice' in el.dataset) {
    if (state.today) state.today.tts_rate = Number(document.getElementById('rate').value);
    return speakButton(el, 'Bonjour ! On se fait un café cet après-midi ?');
  }
  if (el.dataset.cal) {
    const included = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(included));
    try { state.settings = await api('save_settings', { calendar: { id: el.dataset.cal, included } }); } catch (err) { el.setAttribute('aria-checked', String(!included)); fail(err); }
  }
  if ('rerun' in el.dataset) {
    el.disabled = true;
    try {
      state.today = await api('rerun_week');
      state.revealed = new Set(); state.heard = {};
      toast('Thème recalculé : ' + state.today.theme.name_fr);
      return go('today');
    } catch (err) { el.disabled = false; return fail(err); }
  }
  if ('disconnect' in el.dataset) {
    store.del('elise.token');
    state.today = null; state.saved = null; state.settings = null;
    render();
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Session length for the Practice log (VERA reads it): sent when the app is hidden.
let sessionStart = document.visibilityState === 'visible' ? Date.now() : null;
function endSession() {
  if (!sessionStart) return;
  const minutes = (Date.now() - sessionStart) / 60000;
  sessionStart = null;
  if (minutes >= 0.5 && store.get('elise.token')) api('practice', { minutes: Math.max(1, Math.round(minutes)) }, { keepalive: true }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') endSession(); else sessionStart = Date.now(); });
window.addEventListener('pagehide', endSession);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.view === 'today' && store.get('elise.token')) loadToday(); });
go('today');
