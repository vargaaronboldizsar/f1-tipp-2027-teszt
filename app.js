// -----------------------------------------------------------------------------
// 1. Firebase inicializálása és közös segédfüggvények
// -----------------------------------------------------------------------------
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
import { buildLeaderboard, getPlayerSeasonStats } from './scoring.js';

const firebaseConfig = {
  apiKey: "AIzaSyC-QBlvnLLWjajTbu02zINRYT-b-mnKH-I",
  authDomain: "f1-tipp-2027-teszt.firebaseapp.com",
  projectId: "f1-tipp-2027-teszt",
  storageBucket: "f1-tipp-2027-teszt.firebasestorage.app",
  messagingSenderId: "933738803255",
  appId: "1:933738803255:web:2435d9402387acee300fb2"
};

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
let currentUser = null;
const $ = id => document.getElementById(id);
const teamColors = {
  ferrari:     '#e8002d',
  mclaren:     '#ff8000',
  mercedes:    '#00d7b8',
  redbull:     '#3671c6',
  williams:    '#1868db',
  astonmartin: '#229971',
  alpine:      '#0093cc',
  racingbulls: '#6692ff',
  audi:        '#e0002b',
  haas:        '#ffffff'
};

function applyTeamTheme() {
  const team = $('teamSelect').value;
  const standard = $('standardTheme').checked;
  const color = standard ? '#f20a24' : (teamColors[team] || '#e10600');

  document.documentElement.style.setProperty('--red', color);
  document.documentElement.style.setProperty('--accent', color);
}

$('teamSelect').addEventListener('change', applyTeamTheme);
$('standardTheme').addEventListener('change', applyTeamTheme);

applyTeamTheme();

function toast(message) { const t = $('toast'); t.textContent = message; t.classList.remove('hidden'); clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => t.classList.add('hidden'), 4200); }
// -----------------------------------------------------------------------------
// 2. Profilbeállítások mentése, Google-bejelentkezés és munkamenet kezelése
// -----------------------------------------------------------------------------
$('settingsCancel').addEventListener('click', () => $('settingsOverlay').classList.add('hidden'));

$('saveProfileButton').addEventListener('click', async () => {
  if (!currentUser) {
    toast('Előbb jelentkezz be.');
    return;
  }

  const username = $('username').value.trim();

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    $('profileStatus').textContent =
      'A felhasználónév 3–24 karakter legyen: betűk, számok vagy aláhúzás.';
    $('username').focus();
    return;
  }

  const data = {
    username,
    team: $('teamSelect').value,
    themeMode: $('standardTheme').checked ? 'standard' : 'team',
    favoriteDriver: $('driverSelect').value,
    helmetId: selectedHelmetId,
    displayName: username,
    email: currentUser.email || '',
    photoURL: currentUser.photoURL || '',
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'users', currentUser.uid), data, { merge: true });

    $('headerName').textContent = username;
    $('headerTeam').textContent = data.team.toUpperCase() + ' SZURKOLÓ';
    updateProfileIdentity(data);
    $('settingsOverlay').classList.add('hidden');

    toast('Profilbeállítások elmentve a Firebase-be.');
  } catch (e) {
    $('profileStatus').textContent = 'Mentési hiba: ' + e.message;
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  $('loginOpen').classList.toggle('hidden', !!user);
  $('logoutButton').classList.toggle('hidden', !user);
  $('profileNavButton')?.classList.toggle('hidden', !user);

  $('headerName').textContent = user?.displayName || 'Vendég';
  $('headerTeam').textContent = user ? 'F1 Tipp 2026' : 'Jelentkezz be';

  const av = $('headerAvatar');

  if (user?.photoURL) {
    av.src = user.photoURL;
    av.classList.remove('hidden');
  } else {
    av.removeAttribute('src');
    av.classList.add('hidden');
  }

  if (!user) return;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));

    if (snap.exists()) {
      const d = snap.data();

      $('username').value = d.username || '';
      $('headerName').textContent = d.username || user.displayName || 'Versenyző';
      $('headerTeam').textContent = d.team
        ? d.team.toUpperCase() + ' SZURKOLÓ'
        : 'F1 Tipp 2026';

      $('teamSelect').value = d.team || 'ferrari';
      $('driverSelect').value = d.favoriteDriver || 'leclerc';
      $('standardTheme').checked = d.themeMode === 'standard';
      selectedHelmetId = d.helmetId || 'schumacher-2000';
      applyTeamTheme();
      updateProfileIdentity(d);
    } else {
      await setDoc(doc(db, 'users', user.uid), {
        username: '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        team: 'ferrari',
        themeMode: 'team',
        favoriteDriver: 'leclerc',
        helmetId: 'schumacher-2000',
        updatedAt: serverTimestamp()
      }, { merge: true });

      $('teamSelect').value = 'ferrari';
      $('driverSelect').value = 'leclerc';
      $('standardTheme').checked = false;
      selectedHelmetId = 'schumacher-2000';
      applyTeamTheme();
      updateProfileIdentity({username:'',team:'ferrari',favoriteDriver:'leclerc',helmetId:selectedHelmetId});
    }
  } catch (e) {
    console.warn('Profilbetöltési hiba', e);
    toast('A bejelentkezés sikerült, de a profiladatok most nem tölthetők be.');
  }
});

$('loginOpen').addEventListener('click', () => { $('loginOverlay').classList.remove('hidden'); $('loginStatus').textContent = ''; });
$('headerAvatar').addEventListener('click', () => openSection('profile'));
$('headerAvatar').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSection('profile'); } });
$('loginCancel').addEventListener('click', () => $('loginOverlay').classList.add('hidden'));
// GitHub Pages alatt a redirectes Google-belépés iOS-en a külső auth domain
// miatt nem mindig állítja vissza a munkamenetet. Popup-alapú belépést használunk,
// amely a GitHub Pages domainről is vissza tud térni az alkalmazásba.

$('loginButton').addEventListener('click', async () => {
  const b = $('loginButton');
  b.disabled = true;
  $('loginStatus').classList.remove('error');
  $('loginStatus').textContent = 'Kapcsolódás a Google-fiókhoz…';
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
    $('loginOverlay').classList.add('hidden');
  } catch (e) {
    $('loginStatus').textContent = ({
      'auth/popup-closed-by-user': 'A belépési ablak bezárult.',
      'auth/popup-blocked': 'A böngésző blokkolta a belépési ablakot. Próbáld újra, vagy nyisd meg a webappot Safariban.',
      'auth/unauthorized-domain': 'Ez a domain nincs engedélyezve a Firebase Authentication beállításaiban.',
      'auth/operation-not-supported-in-this-environment': 'Ebben a böngészőkörnyezetben nem támogatott a belépés. Nyisd meg a webappot Safariban.'
    })[e.code] || ('Sikertelen belépés: ' + (e.code || e.message));
    $('loginStatus').classList.add('error');
  } finally {
    b.disabled = false;
  }
});
$('logoutButton').addEventListener('click', async () => {
  try {
    await signOut(auth);
    toast('Sikeresen kijelentkeztél.');
  }
  catch (e) {
    toast('Kijelentkezési hiba: ' + e.message);
  }
});

// 2026-os versenynaptár: Jolpica F1 API. A felhasználói banner/gumi adatok Firestore-ból felülírhatók.
// -----------------------------------------------------------------------------
// 3. Versenyadatok, pályaprofilok, időjárás és visszaszámláló
// -----------------------------------------------------------------------------
const API_BASE = 'https://api.jolpi.ca/ergast/f1';
const trackProfiles = {
  // A pályaadatok közül csak a menetrend/API által szolgáltatott alapadatokat tartjuk meg.
  // A négy mérnöki jellemzőhöz nincs hiteles, egységes 1–4-es forrásérték, ezért nem pontozzuk őket.
  'americas': { length: 5.513, corners: 20, laps: 56, lat: 30.1328, lon: -97.6411, timezone: 'America/Chicago' },
  'rodriguez': { length: 4.304, corners: 17, laps: 71, lat: 19.4042, lon: -99.0907, timezone: 'America/Mexico_City' },
  'interlagos': { length: 4.309, corners: 15, laps: 71, lat: -23.7036, lon: -46.6997, timezone: 'America/Sao_Paulo' },
  'vegas': { length: 6.201, corners: 17, laps: 50, lat: 36.1147, lon: -115.1728, timezone: 'America/Los_Angeles' },
  'losail': { length: 5.419, corners: 16, laps: 57, lat: 25.49, lon: 51.4542, timezone: 'Asia/Qatar' },
  'yas_marina': { length: 5.281, corners: 16, laps: 58, lat: 24.4672, lon: 54.6031, timezone: 'Asia/Dubai' }
};
function profileFor(race) {
  const id = (race.Circuit?.circuitId || '').toLowerCase();
  return trackProfiles[id] || {
    length: null, corners: null, laps: null,
    lat: Number(race.Circuit?.Location?.lat) || 0,
    lon: Number(race.Circuit?.Location?.long) || 0,
    timezone: 'auto'
  };
}
// Forrásolt pályaprofilok a Firestore circuitProfiles kollekcióból.
// A jellemzők minőségi leírások, nem pontszámok; a forráslink minden profilon megjelenik.
async function setTraitRows(profile) {
  const rows = [...document.querySelectorAll('.bars .bar-row')];
  if (!document.getElementById('apex-trait-score-style')) {
    const style = document.createElement('style');
    style.id = 'apex-trait-score-style';
    style.textContent = `
      .bars .bar-row { grid-template-columns: minmax(105px, .95fr) minmax(70px, 1fr) 44px; gap: 8px; align-items: center; }
      .bars .bar-row > span { color: #d9e2eb; font-size: 11px; line-height: 1.3; }
      .bars .bar-row .bar { display: flex !important; height: 9px; gap: 3px; min-width: 0; }
      .bars .bar-row .bar i { flex: 1; min-width: 0; height: 100%; border-radius: 2px; background: #263540; opacity: 1; }
      .bars .bar-row .bar i.on { background: var(--red, #e10600); }
      .bars .bar-row em { font-size: 10px; color: #c0ccd8; white-space: nowrap; text-align: right; font-style: normal; }
      .apex-profile-source-note { margin-top: 10px; font-size: 10px; line-height: 1.45; opacity: .82; }
      .apex-profile-source-note a { text-decoration: underline; }
      .apex-profile-method-note { margin-top: 4px; font-size: 10px; line-height: 1.4; color: #9aabba; }
      @media (max-width: 760px) { .bars .bar-row { grid-template-columns: minmax(88px, .9fr) minmax(54px, 1fr) 40px; gap: 6px; } .bars .bar-row > span { font-size: 10px; } }
    `;
    document.head.appendChild(style);
  }
  const rawCircuitId = String(profile.circuitId || profile.Circuit?.circuitId || '').trim().toLowerCase();
  const normalizeCircuitId = value => String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const aliases = {
    albert_park: 'albert_park', melbourne: 'albert_park', australian: 'albert_park', australia: 'albert_park',
    shanghai: 'shanghai', china: 'shanghai', chinese: 'shanghai', suzuka: 'suzuka', japan: 'suzuka', japanese: 'suzuka',
    villeneuve: 'villeneuve', canada: 'villeneuve', canadian: 'villeneuve', montreal: 'villeneuve',
    spain: 'catalunya', spanish: 'catalunya', barcelona: 'catalunya',
    austria: 'red_bull_ring', austrian: 'red_bull_ring', spielberg: 'red_bull_ring',
    spa: 'spa', belgium: 'spa', belgian: 'spa', spa_francorchamps: 'spa',
    monza: 'monza', italy: 'monza', italian: 'monza', zandvoort: 'zandvoort', netherlands: 'zandvoort', dutch: 'zandvoort',
    madrid: 'madring', united_states: 'americas', us: 'americas', usa: 'americas', austin: 'americas', cota: 'americas',
    mexico: 'rodriguez', mexico_city: 'rodriguez', mexican: 'rodriguez',
    singapore: 'marina_bay', singaporean: 'marina_bay',
    las_vegas: 'vegas', vegas_strip: 'vegas', qatar: 'losail', lusail: 'losail',
    abu_dhabi: 'yas_marina', yas_island: 'yas_marina', brazil: 'interlagos', sao_paulo: 'interlagos',
    azerbaijan: 'baku', baku_city: 'baku', hungaroring: 'hungaroring', hungary: 'hungaroring', hungarian: 'hungaroring',
    miami_gardens: 'miami'
  };
  const nameCandidates = [profile.circuit, profile.Circuit?.circuitName, profile.name, profile.raceName, profile.grandPrixNameHu];
  const candidateIds = [...new Set([
    rawCircuitId,
    aliases[normalizeCircuitId(rawCircuitId)],
    ...nameCandidates.map(normalizeCircuitId),
    ...nameCandidates.map(value => aliases[normalizeCircuitId(value)])
  ].filter(Boolean))];
  let data = null;
  try {
    for (const id of candidateIds) {
      const snap = await getDoc(doc(db, 'circuitProfiles', id));
      if (snap.exists()) { data = snap.data(); break; }
    }
    // Fallback: a naptár pályaazonosítója eltérhet a profil dokumentumazonosítójától.
    if (!data) {
      const allProfiles = await getDocs(collection(db, 'circuitProfiles'));
      const wantedNames = nameCandidates.map(normalizeCircuitId).filter(name => name.length >= 5);
      allProfiles.forEach(item => {
        if (data) return;
        const candidate = item.data() || {};
        const storedNames = [candidate.trackName, candidate.grandPrixNameHu, candidate.circuitName, candidate.raceName]
          .map(normalizeCircuitId).filter(name => name.length >= 5);
        if (storedNames.some(stored => wantedNames.some(wanted => stored === wanted || stored.includes(wanted) || wanted.includes(stored)))) data = candidate;
      });
    }
  } catch (e) { console.error('APEX circuitProfiles olvasási hiba:', e); }
  const highlights = Array.isArray(data?.highlights) ? data.highlights.slice(0, 4) : [];
  rows.forEach((row, i) => {
    const trait = highlights[i];
    const label = row.querySelector('span') || document.createElement('span');
    const bar = row.querySelector('.bar') || document.createElement('div');
    const value = row.querySelector('em') || document.createElement('em');
    row.classList.toggle('data-unavailable', !trait || !Number.isFinite(Number(trait.score)));
    label.textContent = trait?.label || 'Nincs adat';
    bar.className = 'bar';
    bar.replaceChildren();
    const score = Number(trait?.score);
    for (let n = 1; n <= 5; n++) {
      const segment = document.createElement('i');
      if (Number.isFinite(score) && n <= score) segment.classList.add('on');
      segment.setAttribute('aria-hidden', 'true');
      bar.appendChild(segment);
    }
    value.textContent = Number.isFinite(score) ? `${score}/5` : '—';
    const evidence = trait?.evidence || trait?.descriptor || '';
    row.title = evidence;
    row.setAttribute('aria-label', `${label.textContent}: ${value.textContent}${evidence ? '. ' + evidence : ''}`);
    row.replaceChildren(label, bar, value);
  });
  const panelBody = document.querySelector('.bars')?.parentElement;
  if (panelBody) {
    const summary = panelBody.querySelector('.apex-profile-summary');
    if (summary) summary.remove();
    let source = panelBody.querySelector('.apex-profile-source-note');
    if (!source) { source = document.createElement('p'); source.className = 'apex-profile-source-note'; panelBody.appendChild(source); }
    source.replaceChildren();
    if (data?.source?.url || data?.sourceUrl) {
      source.append(document.createTextNode('Forrás: '));
      const link = document.createElement('a'); link.href = data.source?.url || data.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Pirelli – 2026-os pályaleírás'; source.append(link);
    } else {
      source.remove();
    }
    const method = panelBody.querySelector('.apex-profile-method-note');
    if (method) method.remove();
  }
}
function formatRaceDate(race) { const d = new Date(`${race.date}T${race.time || '12:00:00Z'}`); return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
async function loadRace() {
  let races = [];
  try {
    const scheduleSnap = await getDoc(doc(db, 'raceCalendars', '2026'));
    if (!scheduleSnap.exists()) throw Error('A 2026-os versenynaptár nincs a Firestore-ban. Futtasd az importálót.');
    const scheduleData = scheduleSnap.data() || {};
    races = Array.isArray(scheduleData.events) ? scheduleData.events : [];
    if (!races.length) throw Error('A Firestore versenynaptára üres.');
  }
  catch (e) {
    console.error('Firestore race calendar unavailable', e);
    $('heroStatus').textContent = 'A Firestore versenynaptára nem érhető el. Ellenőrizd a raceCalendars/2026 dokumentumot.';
    return;
  }
  const now = Date.now();
  const next = races.find(r => new Date(`${r.date}T${r.time || '12:00:00Z'}`).getTime() > now) || races[races.length - 1];
  if (!next)
    return;
  const circuitId = next.Circuit?.circuitId || 'unknown';
  let race = { name: next.raceName, circuit: next.Circuit?.circuitName || 'F1 pálya', date: `${next.date}T${next.time || '12:00:00Z'}`, lat: Number(next.Circuit?.Location?.lat) || 0, lon: Number(next.Circuit?.Location?.long) || 0, circuitId };
  const profile = profileFor(next);
  race = { ...race, ...profile };
  // Race-specifikus tartalom szerkeszthető a Firestore races/2026-{circuitId} dokumentumban.
  try {
    const snap = await getDoc(doc(db, 'races', `2026-${circuitId}`));
    if (snap.exists())
      race = { ...race, ...snap.data() };
  }
  catch (e) {
    console.info('Race override not configured; using API data', e);
  }
  $('heroTitle').textContent = (race.heroTitle || race.name).toUpperCase();
  $('heroCircuit').textContent = race.circuit;
  $('heroDate').textContent = race.dateLabel || formatRaceDate(next);
  $('heroStatus').textContent = `2026-os szezon · ${next.round ? 'Forduló ' + next.round : 'Következő futam'} · Firestore`;
  $('trackLength').textContent = race.length ? Number(race.length).toLocaleString('hu-HU', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' km' : '—';
  $('trackCorners').textContent = race.corners ?? '—';
  $('trackLaps').textContent = race.laps ?? '—';
  $('raceDistance').textContent = (race.length && race.laps) ? (race.length * race.laps).toLocaleString('hu-HU', { maximumFractionDigits: 3 }) + ' km' : '—';
  if (race.heroImageUrl) {
    document.querySelector('.hero').style.backgroundImage = `linear-gradient(90deg,#020609 0%,#03090def 27%,#07101870 62%,#050a0e30),linear-gradient(0deg,#050a0e 0%,transparent 35%),url("${race.heroImageUrl}")`;
  }
  // A pályarajzok a Firestore circuits kollekcióban teljes SVG-ként vannak tárolva.
  // A korábbi kód csak egy trackSvgPath mezőt keresett, ezért az importált SVG nem jelent meg.
  loadCircuitSvg(circuitId, race.circuit).catch(error => {
    console.warn('Firestore pályarajz nem tölthető be:', error);
    const caption = document.querySelector('.track-panel .track-caption');
    if (caption) caption.textContent = race.circuit || 'Pályarajz nem érhető el';
  });
  setTraitRows(race);
  $('interestingFact').textContent = 'ⓘ ' + (race.fact || 'A pálya forrásolt összefoglalója a Pirelli leírása alapján jelenik meg.');
  renderTyreShowcase(race, circuitId);
  loadWeather(race, next).catch(e => { console.warn('Weather error', e); $('weatherSummary').textContent = 'Az előrejelzés jelenleg nem érhető el.'; $('weatherSource').textContent = 'Forrás: Open-Meteo · később próbáld újra.'; });
  updateCountdown(race.date);
  document.querySelectorAll('[data-category]').forEach(b => {
    const small = b.querySelector('small'); if (small && b.dataset.category === 'winner')
      small.textContent = 'Ki nyeri a ' + race.name + '-t?';
  });
}
function renderTyreShowcase(race, circuitId) {
  const entries = [
    ['hard', race.tyres?.hard],
    ['medium', race.tyres?.medium],
    ['soft', race.tyres?.soft]
  ];
  const codes = [];
  const compoundCode = value => {
    const match = String(value || '').toUpperCase().match(/C\s*([1-6])/);
    return match ? `C${match[1]}` : '';
  };
  for (const [type, value] of entries) {
    const code = compoundCode(value);
    const label = $(type + 'Compound');
    if (label) label.textContent = code || '—';
    if (code) codes.push(code);
  }
  document.querySelectorAll('.compound-codes [data-compound]').forEach(el => {
    el.classList.toggle('is-selected', codes.includes(el.dataset.compound));
    el.classList.toggle('is-hard', compoundCode(race.tyres?.hard) === el.dataset.compound);
    el.classList.toggle('is-medium', compoundCode(race.tyres?.medium) === el.dataset.compound);
    el.classList.toggle('is-soft', compoundCode(race.tyres?.soft) === el.dataset.compound);
  });
  const source = $('tyreSource');
  if (source) source.textContent = race.tyres
    ? (race.tyreSource || 'Hivatalos hétvégi gumiválasztás · Firestore')
    : 'A hivatalos hétvégi gumiválasztás még nem érhető el.';
}

async function loadCircuitSvg(circuitId, circuitName) {
  const host = document.querySelector('.track-panel .track-layout > div:first-child');
  if (!host) return;
  const snapshot = await getDocs(collection(db, 'circuits'));
  const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const wantedId = norm(circuitId);
  const wantedName = norm(circuitName);
  let match = null;
  snapshot.forEach(item => {
    if (match) return;
    const d = item.data() || {};
    const ids = [item.id, d.circuitId, d.slug, d.id, d.circuit_id].map(norm);
    const names = [d.name, d.circuitName, d.trackName, d.title, d.locality].map(norm);
    if ((wantedId && ids.includes(wantedId)) || (wantedName && names.some(n => n && (n === wantedName || n.includes(wantedName) || wantedName.includes(n))))) match = d;
  });
  if (!match) throw new Error(`Nem található pályarajz: ${circuitId} / ${circuitName}`);
  const svgText = match.trackSvg || match.svg || match.svgContent;
  if (!svgText || typeof svgText !== 'string') throw new Error('A circuits dokumentumban nincs trackSvg mező.');
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('A Firestore trackSvg mező nem érvényes SVG.');
  svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(el => el.remove());
  svg.querySelectorAll('*').forEach(el => [...el.attributes].forEach(attr => {
    if (/^on/i.test(attr.name) || ((attr.name === 'href' || attr.name.endsWith(':href')) && !attr.value.startsWith('#'))) el.removeAttribute(attr.name);
  }));
  svg.setAttribute('class', 'track-svg');
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 260 140');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${circuitName || circuitId} pályarajza`);
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.maxHeight = '190px';
  svg.style.objectFit = 'contain';
  svg.style.display = 'block';

  // A pályadoboz teljes tartalmát újraépítjük, így a régi statikus SVG
  // és a korábbi betöltési placeholder nem maradhat egymás alatt.
  const importedSvg = document.importNode(svg, true);
  const caption = document.createElement('div');
  caption.className = 'track-caption';
  caption.textContent = String(match.name || match.circuitName || match.trackName || circuitName || circuitId);
  host.replaceChildren(importedSvg, caption);

  // A pályarajz-dokumentum adataiból is próbáljuk feloldani a kanyarszámot.
  const cornerCount = match.corners ?? match.cornerCount ?? match.turns ?? match.numberOfCorners;
  if (cornerCount != null && $('trackCorners')) $('trackCorners').textContent = cornerCount;
  const lapCount = match.laps ?? match.lapCount ?? match.raceLaps;
  if (lapCount != null && $('trackLaps')) {
    $('trackLaps').textContent = lapCount;
    const lengthText = $('trackLength')?.textContent || '';
    const length = Number(lengthText.replace(/\s*km/i, '').replace(/\./g, '').replace(',', '.').trim());
    if (Number.isFinite(length) && length > 0) $('raceDistance').textContent = (length * Number(lapCount)).toLocaleString('hu-HU', { maximumFractionDigits: 3 }) + ' km';
  }
}

async function loadWeather(race, apiRace) {
  const start = new Date(race.date), daysAway = (start - Date.now()) / 86400000; if (daysAway < 0) {
    $('weatherTemp').textContent = '—°C';
    $('weatherSummary').textContent = 'A futam már lezajlott';
    $('weatherSource').textContent = 'A futamhoz tartozó archív időjárás külön adatforrást igényel.';
    return;
  } if (daysAway > 15) {
    $('weatherTemp').textContent = '—°C';
    $('weatherSummary').textContent = 'Pontos előrejelzés a futam előtt kb. 1–2 héttel';
    $('weatherSource').textContent = 'Forrás: Open-Meteo · 16 napos előrejelzési ablak';
    return;
  } if (!race.lat || !race.lon)
    throw Error('A pálya koordinátái hiányoznak'); const u = `https://api.open-meteo.com/v1/forecast?latitude=${race.lat}&longitude=${race.lon}&daily=temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,weather_code,relative_humidity_2m_mean&timezone=${encodeURIComponent(race.timezone || 'auto')}&forecast_days=16`; const res = await fetch(u); if (!res.ok)
    throw Error('Open-Meteo HTTP ' + res.status); const data = await res.json(); const target = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`; const i = data.daily.time.indexOf(target); if (i < 0)
    throw Error('A futam napjára még nincs előrejelzés'); $('weatherTemp').textContent = Math.round(data.daily.temperature_2m_max[i]) + '°C'; $('weatherRain').textContent = (data.daily.precipitation_probability_max?.[i] ?? '—') + '%'; $('weatherWind').textContent = Math.round(data.daily.wind_speed_10m_max?.[i] ?? 0) + ' km/h'; $('weatherHumidity').textContent = (data.daily.relative_humidity_2m_mean?.[i] ?? '—') + '%'; const code = data.daily.weather_code?.[i]; let icon = '⛅'; if (code === 0)
    icon = '☀️';
  else if ([1, 2, 3].includes(code))
    icon = '🌤️';
  else if ([45, 48].includes(code))
    icon = '🌫️';
  else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code))
    icon = '🌧️'; $('weatherIcon').textContent = icon; $('weatherSummary').textContent = 'A futam napjára szóló napi előrejelzés'; $('weatherSource').textContent = 'Forrás: Open-Meteo · az előrejelzés változhat';
}
function updateCountdown(dateString) {
  const target = new Date(dateString).getTime(); function tick() {
    let diff = target - Date.now(); if (diff <= 0) {
      $('days').textContent = '00';
      $('hours').textContent = '00';
      $('minutes').textContent = '00';
      $('seconds').textContent = '00';
      return;
    } $('days').textContent = Math.floor(diff / 86400000).toString().padStart(2, '0'); $('hours').textContent = Math.floor(diff % 86400000 / 3600000).toString().padStart(2, '0'); $('minutes').textContent = Math.floor(diff % 3600000 / 60000).toString().padStart(2, '0'); $('seconds').textContent = Math.floor(diff % 60000 / 1000).toString().padStart(2, '0');
  } tick(); setInterval(tick, 1000);
}
loadRace();
// -----------------------------------------------------------------------------
// 4. Navigáció és jelenleg még külön fejlesztési lépést igénylő nézetek
// -----------------------------------------------------------------------------

let tipRacesLoaded = false;
let tipDriverCatalog = [];
let tipReferenceRequest = 0;

function normalizeDriverText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function resolveTipDriver(value) {
  const key = normalizeDriverText(value);
  if (!key) return null;
  const aliases = {
    max: 'verstappen', 'max verstappen': 'verstappen', 'mad max': 'verstappen',
    lewis: 'hamilton', 'sir lewis': 'hamilton', 'lewis hamilton': 'hamilton',
    charles: 'leclerc', 'charles leclerc': 'leclerc', 'lando': 'norris',
    'lando norris': 'norris', 'oscar': 'piastri', 'oscar piastri': 'piastri',
    'checo': 'perez', 'sergio perez': 'perez', 'fernando': 'alonso',
    'george': 'russell', 'carlos': 'sainz', 'carlos sainz': 'sainz',
    'kimi': 'antonelli', 'kimi antonelli': 'antonelli', 'pierre': 'gasly',
    'alex': 'albon', 'alex albon': 'albon', 'nico': 'hulkenberg',
    'hulkenberg': 'hulkenberg', 'ollie': 'bearman', 'oliver': 'bearman'
  };
  const aliasTarget = aliases[key];
  const candidates = tipDriverCatalog.map(d => ({...d, full: normalizeDriverText(`${d.givenName} ${d.familyName}`), first: normalizeDriverText(d.givenName), last: normalizeDriverText(d.familyName), code: normalizeDriverText(d.code || '')}));
  return candidates.find(d => d.full === key || d.last === key || d.first === key || d.code === key || d.driverId === key || (aliasTarget && d.driverId === aliasTarget)) || null;
}
function tipDriverName(id) {
  const d = tipDriverCatalog.find(x => x.driverId === id);
  return d ? `${d.givenName} ${d.familyName}` : (id || '');
}
function normalizePoleTimeInput(raw) {
  let v = String(raw || '').trim().replace(/,/g, '.').replace(/\s/g, '');
  if (!v) return '';
  if (/^\d{5,6}$/.test(v)) {
    const digits = v.padStart(6, '0');
    v = `${Number(digits.slice(0, -5))}:${digits.slice(-5, -3)}.${digits.slice(-3)}`;
  } else if (/^\d{1,2}\.\d{2}\.\d{3}$/.test(v)) {
    v = v.replace('.', ':').replace('.', '.');
  } else if (/^\d{1,2}:?\d{2}\.\d{3}$/.test(v) && !v.includes(':')) {
    v = v.replace(/^(\d{1,2})(\d{2}\.\d{3})$/, '$1:$2');
  }
  return v;
}
function tipTimeToMs(value) { const m = String(value || '').trim().match(/^(?:(\d+):)?(\d{1,2})\.(\d{3})$/); return m ? ((Number(m[1] || 0) * 60 + Number(m[2])) * 1000 + Number(m[3])) : null; }
function updateTipPredictionWarning() {
  const target = $('tipPredictionWarning');
  if (!target) return;
  const entered = normalizePoleTimeInput($('tipPoleTime')?.value || '');
  const reference = Number(target.dataset.referenceMs || 0);
  if (!entered || !reference) { target.textContent = ''; return; }
  const ms = tipTimeToMs(entered);
  if (ms === null) { target.textContent = 'Ellenőrizd az idő formátumát; példa: 1:32.456.'; target.style.color = '#ffbd69'; return; }
  const delta = ms - reference;
  const pct = Math.abs(delta) / reference * 100;
  if (pct > 5) {
    target.textContent = `Figyelem: a tipped ${Math.abs(delta / 1000).toFixed(3)} mp-cel (${pct.toFixed(1)}%-kal) ${delta < 0 ? 'gyorsabb' : 'lassabb'} a tavalyi pole-időnél. Ellenőrizd, hogy reális-e.`;
    target.style.color = '#ffbd69';
  } else {
    target.textContent = `A tipped ${Math.abs(delta / 1000).toFixed(3)} mp-re (${pct.toFixed(2)}%-ra) van a tavalyi pole-időtől.`;
    target.style.color = 'var(--muted)';
  }
}
async function loadTipReferenceData() {
  const option = $('tipRaceSelect')?.selectedOptions?.[0];
  const status = $('tipReferenceStatus'); const data = $('tipReferenceData'); const warning = $('tipPredictionWarning');
  if (!option?.value || !status || !data) return;
  const requestId = ++tipReferenceRequest;
  status.textContent = 'Tavalyi időmérő- és szabadedzésadatok betöltése…'; data.innerHTML = '';
  if (warning) { warning.textContent = ''; delete warning.dataset.referenceMs; }
  loadTipWeekendWeather(option, requestId).catch(err => { console.warn('Hétvégi időjárás betöltése sikertelen:', err); const status = $('tipWeekendWeatherStatus'); if (status) status.textContent = 'Az előrejelzés most nem tölthető be. Próbáld újra később.'; });
  const circuitId = option.dataset.circuitId || '';
  // A 2025-ös történeti eredmények lezártak: böngészőben tartósan cache-eljük őket,
  // így ugyanazt a versenyt nem kérjük le újra minden oldalnyitáskor.
  const referenceCacheKey = `apex-tip-reference-v5-2025-${circuitId || normalizeDriverText(option.dataset.raceName || option.textContent)}`;
  try {
    const cachedRaw = localStorage.getItem(referenceCacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.status && cached?.html) {
        if (requestId !== tipReferenceRequest) return;
        status.textContent = `${cached.status} · gyorsítótárból`;
        data.innerHTML = cached.html;
        if (warning && cached.referenceMs) warning.dataset.referenceMs = String(cached.referenceMs);
        updateTipPredictionWarning();
        return;
      }
    }
  } catch (cacheError) { console.info('A DATA CHECK cache nem olvasható, friss API-lekérés következik.', cacheError); }
  try {
    const scheduleRes = await fetch(`${API_BASE}/2025/races/?limit=100`);
    if (!scheduleRes.ok) throw new Error(`2025-ös versenynaptár HTTP ${scheduleRes.status}`);
    const scheduleJson = await scheduleRes.json();
    const previousRaces = scheduleJson.MRData?.RaceTable?.Races || [];
    let previousRace = circuitId ? previousRaces.find(r => r.Circuit?.circuitId === circuitId) : null;
    if (!previousRace) {
      const currentName = normalizeDriverText(option.dataset.raceName || option.textContent).replace(/\b(gp|sprint|grand prix)\b/g, '').trim();
      previousRace = previousRaces.find(r => normalizeDriverText(r.raceName).replace(/\b(grand prix)\b/g, '').trim().includes(currentName) || currentName.includes(normalizeDriverText(r.raceName).replace(/\b(grand prix)\b/g, '').trim()));
    }
    if (!previousRace) throw new Error(`Nem találtam megfelelő 2025-ös futamot a(z) ${option.textContent} eseményhez.`);
    const round = previousRace.round;
    const [qualRes, p3Res, p2Res, p1Res] = await Promise.all([
      fetch(`${API_BASE}/2025/${round}/qualifying/?limit=100`),
      fetch(`${API_BASE}/2025/${round}/practice/3/?limit=100`),
      fetch(`${API_BASE}/2025/${round}/practice/2/?limit=100`),
      fetch(`${API_BASE}/2025/${round}/practice/1/?limit=100`)
    ]);
    if (!qualRes.ok) throw new Error(`Időmérő API HTTP ${qualRes.status}`);
    const qualJson = await qualRes.json();
    if (requestId !== tipReferenceRequest) return;
    const qualRows = qualJson.MRData?.RaceTable?.Races?.[0]?.QualifyingResults || [];
    const pole = qualRows.find(x => Number(x.position) === 1);
    const poleTime = pole?.Q3 || pole?.Q2 || pole?.Q1 || '';
    const poleName = pole?.Driver ? `${pole.Driver.givenName || ''} ${pole.Driver.familyName || ''}`.trim() : '—';
    // A Jolpica/Ergast-kompatibilis API nem szolgáltat megbízható szabadedzés-eredményeket.
    // A szabadedzés legjobb körét ezért az OpenF1 történeti session + laps + drivers adataiból számoljuk.
    let practiceRows = [], practiceLabel = '', practiceSource = 'OpenF1';
    try {
      const openBase = 'https://api.openf1.org/v1';
      const [meetingsRes, sessionsRes] = await Promise.all([
        fetch(`${openBase}/meetings?year=2025&limit=1000`),
        fetch(`${openBase}/sessions?year=2025&limit=1000`)
      ]);
      if (!meetingsRes.ok || !sessionsRes.ok) throw new Error('OpenF1 session/meeting API nem elérhető');
      const meetings = await meetingsRes.json();
      const sessions = await sessionsRes.json();
      const location = normalizeDriverText(previousRace.Circuit?.Location?.locality || '');
      const country = normalizeDriverText(previousRace.Circuit?.Location?.country || '');
      const circuitName = normalizeDriverText(previousRace.Circuit?.circuitName || '');
      const norm = v => normalizeDriverText(v).replace(/\b(circuit|international|grand prix|formula 1|f1)\b/g, '').trim();
      let meeting = meetings.find(m => {
        const ml = norm(m.location || ''); const ms = norm(m.circuit_short_name || '');
        const mn = norm(m.meeting_name || ''); const mc = norm(m.meeting_official_name || '');
        const race = norm(previousRace.raceName).replace(/\bgrand prix\b/g, '').trim();
        return (location && (ml === norm(location) || (ml && norm(location).includes(ml)) || (ml && ml.includes(norm(location)))))
          || (ms && norm(circuitName).includes(ms))
          || (race && (mn.includes(race) || race.includes(mn) || mc.includes(race)));
      });
      if (!meeting && country) meeting = meetings.find(m => norm(m.country_name) === country && norm(m.meeting_name).includes(norm(previousRace.raceName).replace(/\bgrand prix\b/g,'')));
      if (!meeting && country) {
        const candidates = meetings.filter(m => norm(m.country_name) === country);
        if (candidates.length === 1) meeting = candidates[0];
      }
      if (meeting) {
        const practiceSessions = sessions.filter(x => Number(x.meeting_key) === Number(meeting.meeting_key) && /^Practice [123]$/.test(x.session_name || '')).sort((a,b) => Number((b.session_name||'').slice(-1)) - Number((a.session_name||'').slice(-1)));
        for (const session of practiceSessions) {
          // Elsőként az OpenF1 session_result végpontját használjuk: practice esetén
          // a duration a pilóta legjobb körét adja meg, nem kell a teljes körlistát letölteni.
          // Ez kisebb, gyorsabb és kevésbé érzékeny a laps-végpont lapozására.
          const [resultRes, driversRes] = await Promise.all([
            fetch(`${openBase}/session_result?session_key=${session.session_key}&limit=1000`),
            fetch(`${openBase}/drivers?session_key=${session.session_key}&limit=1000`)
          ]);
          let bestSessionLap = null;
          if (resultRes.ok && driversRes.ok) {
            const [results, sessionDrivers] = await Promise.all([resultRes.json(), driversRes.json()]);
            const driverMap = new Map(sessionDrivers.map(d => [Number(d.driver_number), `${d.first_name || ''} ${d.last_name || ''}`.trim()]));
            const ranked = results.map(r => {
              const raw = Array.isArray(r.duration) ? r.duration.filter(Number.isFinite).sort((a,b)=>a-b)[0] : Number(r.duration);
              return { _seconds: raw, _name: driverMap.get(Number(r.driver_number)) || `#${r.driver_number}` };
            }).filter(r => Number.isFinite(r._seconds) && r._seconds > 0).sort((a,b)=>a._seconds-b._seconds);
            if (ranked.length) {
              const r = ranked[0];
              bestSessionLap = { ...r, _time: `${Math.floor(r._seconds/60)}:${(r._seconds%60).toFixed(3).padStart(6,'0')}` };
            }
          }
          // Tartalék: ha a session_result az adott hétvégére nem tartalmaz adatot,
          // a körlistából számoljuk ki a leggyorsabb érvényes kört.
          if (!bestSessionLap) {
            const lapsRes = await fetch(`${openBase}/laps?session_key=${session.session_key}&limit=1000`);
            if (lapsRes.ok) {
              const laps = await lapsRes.json();
              const bestByDriver = new Map();
              for (const lap of laps) {
                const duration = Number(lap.lap_duration);
                if (!Number.isFinite(duration) || duration <= 0 || lap.is_pit_out_lap) continue;
                const no = Number(lap.driver_number);
                if (!bestByDriver.has(no) || duration < bestByDriver.get(no)._seconds) bestByDriver.set(no, { _seconds: duration, _time: `${Math.floor(duration/60)}:${(duration%60).toFixed(3).padStart(6,'0')}`, _name: `#${no}` });
              }
              bestSessionLap = Array.from(bestByDriver.values()).sort((a,b)=>a._seconds-b._seconds)[0] || null;
              if (bestSessionLap) {
                const d = await fetch(`${openBase}/drivers?session_key=${session.session_key}&driver_number=${encodeURIComponent(String(bestSessionLap._name).replace('#',''))}`);
                if (d.ok) { const ds = await d.json(); if (ds[0]) bestSessionLap._name = `${ds[0].first_name || ''} ${ds[0].last_name || ''}`.trim() || bestSessionLap._name; }
              }
            }
          }
          if (bestSessionLap) { practiceRows = [bestSessionLap]; practiceLabel = session.session_name.replace('Practice','FP'); break; }
        }
      }
    } catch (practiceError) {
      console.warn('OpenF1 szabadedzésadat nem tölthető be:', practiceError);
    }
    let best = practiceRows[0];
    let bestTime = best?._time || '';
    let bestName = best?._name || '—';
    // Tartalék adatforrás: az előzőleg importált 2025-ös sessionök a Firestore-ban.
    // Ezt akkor is megpróbáljuk, ha a böngészőből az OpenF1 laps/session_result API nem elérhető.
    let firestorePracticeUsed = false;
    if (!bestTime) {
      try {
        const historicalSnap = await getDocs(query(collection(db, 'historicalF1Sessions'), where('season', '==', 2025)));
        const normalizePlace = value => normalizeDriverText(value).replace(/\b(circuit|international|grand prix|formula 1|f1|street circuit)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const raceLocation = normalizePlace(previousRace.Circuit?.Location?.locality || '');
        const raceCircuit = normalizePlace(previousRace.Circuit?.circuitName || '');
        const raceCountry = normalizePlace(previousRace.Circuit?.Location?.country || '');
        const historical = historicalSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
          .filter(row => ['FP1', 'FP2', 'FP3'].includes(row.sessionType) && Array.isArray(row.results) && row.results.length)
          .map(row => {
            const rowLocation = normalizePlace(row.location || '');
            const rowCircuit = normalizePlace(row.circuitShortName || '');
            const rowCountry = normalizePlace(row.countryName || '');
            let matchScore = 0;
            if (raceLocation && rowLocation && raceLocation === rowLocation) matchScore = 100;
            else if (raceLocation && rowLocation && (raceLocation.includes(rowLocation) || rowLocation.includes(raceLocation))) matchScore = 80;
            else if (raceCircuit && rowCircuit && (raceCircuit.includes(rowCircuit) || rowCircuit.includes(raceCircuit))) matchScore = 70;
            else if (raceCountry && rowCountry && raceCountry === rowCountry && raceLocation && rowLocation && (raceLocation.includes(rowLocation) || rowLocation.includes(raceLocation))) matchScore = 60;
            return { ...row, _matchScore: matchScore };
          })
          .filter(row => row._matchScore > 0)
          .sort((a, b) => b._matchScore - a._matchScore || ({ FP3: 3, FP2: 2, FP1: 1 }[b.sessionType] - { FP3: 3, FP2: 2, FP1: 1 }[a.sessionType]));
        const selectedSession = historical.find(row => row.results.some(result => Number(result.bestLapSeconds) > 0));
        if (selectedSession) {
          const fastest = selectedSession.results
            .filter(result => Number.isFinite(Number(result.bestLapSeconds)) && Number(result.bestLapSeconds) > 0)
            .sort((a, b) => Number(a.bestLapSeconds) - Number(b.bestLapSeconds))[0];
          if (fastest) {
            const seconds = Number(fastest.bestLapSeconds);
            best = { _seconds: seconds, _time: `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`, _name: fastest.driverName || fastest.driverAcronym || (fastest.driverNumber ? `#${fastest.driverNumber}` : 'Ismeretlen pilóta') };
            bestTime = best._time;
            bestName = best._name;
            practiceLabel = selectedSession.sessionType;
            practiceSource = 'Firestore';
            firestorePracticeUsed = true;
          }
        }
      } catch (firestoreError) {
        console.warn('A Firestore-ba importált történeti szabadedzésadat nem olvasható:', firestoreError);
      }
    }
    const practiceDiagnostic = bestTime ? '' : 'Nem érkezett használható szabadedzés-köridő sem az OpenF1 API-ból, sem a historicalF1Sessions Firestore-gyűjteményből.';
    const poleMs = tipTimeToMs(poleTime), practiceMs = tipTimeToMs(bestTime);
    let deltaHtml = '<strong style="display:block;margin-top:6px">Nincs összehasonlítható adat</strong>';
    if (poleMs !== null && practiceMs !== null) {
      const deltaMs = poleMs - practiceMs;
      const pct = Math.abs(deltaMs) / poleMs * 100;
      const relation = deltaMs > 0 ? 'A szabadedzés volt gyorsabb' : deltaMs < 0 ? 'A pole-idő volt gyorsabb' : 'Azonos idő';
      deltaHtml = `<strong style="display:block;margin-top:6px">${deltaMs > 0 ? '−' : deltaMs < 0 ? '+' : '±'}${(Math.abs(deltaMs)/1000).toFixed(3)} mp</strong><small>${(Math.abs(deltaMs)/100).toFixed(1)} tized · ${pct.toFixed(2)}%</small><small style="display:block;margin-top:5px">${relation}</small>`;
    }
    status.textContent = `2025 · ${previousRace.raceName || option.textContent} · időmérő: Jolpica · szabadedzés: ${firestorePracticeUsed ? 'Firestore' : practiceSource}`; 
    data.innerHTML = `<div class="panel" style="padding:12px"><small style="color:var(--muted)">Tavalyi pole-pilóta</small><strong style="display:block;margin-top:6px">${safeText(poleName)}</strong></div><div class="panel" style="padding:12px"><small style="color:var(--muted)">Hivatalos pole-idő</small><strong style="display:block;margin-top:6px">${safeText(poleTime || 'Nincs adat')}</strong></div><div class="panel" style="padding:12px"><small style="color:var(--muted)">Legjobb szabadedzés (${practiceLabel || 'FP'})</small><strong style="display:block;margin-top:6px">${safeText(bestTime || 'Nincs adat')}</strong><small>${safeText(bestName)}</small>${practiceDiagnostic ? `<small style="display:block;margin-top:6px;color:var(--muted)">${safeText(practiceDiagnostic)}</small>` : ''}</div><div class="panel" style="padding:12px"><small style="color:var(--muted)">Pole és szabadedzés különbsége</small>${deltaHtml}</div>`;
    if (warning && poleTime) warning.dataset.referenceMs = String(poleMs || '');
    // Csak akkor cache-eljük a teljes blokkot, ha a szabadedzés valóban betöltődött.
    // A korábbi verzió a hibás/üres FP-eredményt is eltárolta, ezért az örökre Nincs adatként jelent meg.
    if (bestTime && bestName !== '—') {
      try {
        localStorage.setItem(referenceCacheKey, JSON.stringify({ status: status.textContent, html: data.innerHTML, referenceMs: poleMs || null, savedAt: new Date().toISOString() }));
      } catch (cacheError) { console.info('A DATA CHECK eredmény nem menthető cache-be.', cacheError); }
    }
    updateTipPredictionWarning();
  } catch (error) {
    if (requestId !== tipReferenceRequest) return;
    status.textContent = `A tavalyi adatok nem tölthetők be: ${error.message || 'ismeretlen hiba'}. A tipp ettől még menthető.`;
    data.innerHTML = '';
    console.warn('Tavalyi időmérő/szabadedzés-adat betöltése sikertelen:', error);
  }
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if ([1,2,3].includes(code)) return '🌤️';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if ([71,73,75,77,85,86].includes(code)) return '❄️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '⛅';
}
function ensureTipWeekendWeatherPanel() {
  let panel = $('tipWeekendWeatherPanel');
  if (panel) return panel;
  const page = $('tipsPage');
  if (!page) return null;
  panel = document.createElement('section');
  panel.id = 'tipWeekendWeatherPanel';
  panel.className = 'panel';
  panel.style.cssText = 'padding:18px;margin:0 0 18px';
  panel.innerHTML = '<h3 style="margin-top:0">Várható időjárás · péntek–szombat–vasárnap</h3><p id="tipWeekendWeatherStatus" role="status" style="color:var(--muted)">Válassz futamot az előrejelzéshez.</p><div id="tipWeekendWeatherData" class="cards" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"></div><p id="tipWeekendWeatherSource" style="color:var(--muted);font-size:12px;margin-bottom:0">Forrás: Open-Meteo</p>';
  const racePanel = $('tipRaceInfo')?.closest('.panel');
  if (racePanel?.parentNode) racePanel.insertAdjacentElement('afterend', panel);
  else page.prepend(panel);
  return panel;
}

async function loadTipWeekendWeather(option, requestId) {
  ensureTipWeekendWeatherPanel();
  const status = $('tipWeekendWeatherStatus'), dataEl = $('tipWeekendWeatherData'), source = $('tipWeekendWeatherSource');
  if (!status || !dataEl || !source) return;
  status.textContent = 'Péntek–vasárnapi előrejelzés betöltése…'; dataEl.innerHTML = '';
  const lat = Number(option.dataset.lat), lon = Number(option.dataset.lon);
  const raceDate = option.dataset.raceDate || option.dataset.sprintDate;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon || !raceDate) {
    status.textContent = 'Ehhez az eseményhez hiányzik a pálya koordinátája vagy dátuma.'; return;
  }
  const raceDay = new Date(`${raceDate}T12:00:00Z`);
  const friday = new Date(raceDay); friday.setUTCDate(friday.getUTCDate() - (raceDay.getUTCDay() === 0 ? 2 : raceDay.getUTCDay() === 6 ? 1 : raceDay.getUTCDay() === 5 ? 0 : (raceDay.getUTCDay()+2)%7));
  const dates = [0,1,2].map(offset => { const d=new Date(friday); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); });
  const now = new Date(); const max = new Date(); max.setDate(max.getDate()+15);
  if (new Date(`${dates[0]}T00:00:00Z`) > max || new Date(`${dates[2]}T23:59:59Z`) < now) {
    status.textContent = new Date(`${dates[2]}T23:59:59Z`) < now ? 'A kiválasztott versenyhétvége már elmúlt; ehhez archív időjárási adat kell.' : 'A péntek–vasárnapi előrejelzés még nem érhető el. Általában a hétvége előtti 1–2 hétben jelenik meg.';
    source.textContent = 'Forrás: Open-Meteo. A távoli időpontokra nem készül megbízható előrejelzés.'; return;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code&timezone=auto&forecast_days=16`;
  const res = await fetch(url); if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  if (requestId !== tipReferenceRequest) return;
  const daily = json.daily || {};
  dataEl.innerHTML = dates.map((date,i) => {
    const idx = (daily.time || []).indexOf(date);
    const day = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    if (idx < 0) return `<article class="tips-weather-day"><small>${day} · ${date.slice(5)}</small><strong>—</strong><p>Előrejelzés még nincs</p></article>`;
    const eventDay = ['Péntek','Szombat','Vasárnap'][i];
    const code = daily.weather_code?.[idx];
    const desc = ({0:'Derült',1:'Többnyire derült',2:'Részben felhős',3:'Borult',45:'Ködös',48:'Zúzmarás köd',51:'Szitálás',53:'Szitálás',55:'Erős szitálás',61:'Enyhe eső',63:'Eső',65:'Erős eső',71:'Havazás',80:'Zápor',81:'Zápor',82:'Erős zápor',95:'Zivatar'})[code] || 'Változó idő';
    return `<article class="tips-weather-day"><small>${eventDay}</small><div class="tips-weather-icon">${weatherIcon(code)}</div><p class="tips-weather-condition">${desc}</p><strong>${Math.round(daily.temperature_2m_max[idx])}°C</strong><p>Minimum: ${Math.round(daily.temperature_2m_min[idx])}°C</p><p>Eső: ${daily.precipitation_probability_max?.[idx] ?? '—'}% · Szél: ${Math.round(daily.wind_speed_10m_max?.[idx] ?? 0)} km/h</p></article>`;
  }).join('');
  status.textContent = `${option.textContent} · ${raceDate} · péntek–vasárnap`; 
  source.textContent = 'Forrás: Open-Meteo · az előrejelzés változhat.';
}

async function loadSavedTip() {
  if (!currentUser) return;

  const raceId = $('tipRaceSelect').value;
  if (!raceId) return;

  $('tipsStatus').textContent = 'Korábbi tippek betöltése…';

  try {
    const tipRef = doc(db, 'users', currentUser.uid, 'tips', raceId);
    const snap = await getDoc(tipRef);

    if (snap.exists()) {
      const tip = snap.data();
      $('tipPoleDriver').value = tipDriverName(tip.poleDriver) || tip.poleDriver || '';
      $('tipPoleTime').value = tip.poleTime || '';
      $('tipWinnerDriver').value = tipDriverName(tip.winnerDriver) || tip.winnerDriver || '';
      $('tipsStatus').textContent = 'A korábban mentett tipped betöltve.';
    } else {
      $('tipPoleDriver').value = '';
      $('tipPoleTime').value = '';
      $('tipWinnerDriver').value = '';
      $('tipsStatus').textContent = 'Ehhez a futamhoz még nincs mentett tipped.';
    }
    updateTipLocks();
  } catch (error) {
    console.error(error);
    $('tipsStatus').textContent = 'Nem sikerült betölteni a tippeket.';
  }
}



async function saveTips() {
  if (!currentUser) {
    toast('Előbb jelentkezz be.');
    return;
  }

  const raceSelect = $('tipRaceSelect');
  const option = raceSelect.options[raceSelect.selectedIndex];

  if (!option || !option.value) {
    $('tipsStatus').textContent = 'Válassz futamot.';
    return;
  }

  const raceId = option.value;
  const isSprint = option.dataset.eventType === 'sprint';

  const poleField = $('tipPoleDriver');
  const timeField = $('tipPoleTime');
  const winnerField = $('tipWinnerDriver');

  const tipRef = doc(db, 'users', currentUser.uid, 'tips', raceId);

  $('saveTipsButton').disabled = true;
  $('tipsStatus').textContent = 'Tippek mentése…';

  try {
    const snap = await getDoc(tipRef);
    const oldTip = snap.exists() ? snap.data() : {};

    const poleDriver = poleField.disabled
      ? (oldTip.poleDriver || '')
      : (resolveTipDriver(poleField.value)?.driverId || '');

    const poleTime = timeField.disabled
      ? (oldTip.poleTime || '')
      : normalizePoleTimeInput(timeField.value);

    const winnerDriver = winnerField.disabled
      ? (oldTip.winnerDriver || '')
      : (resolveTipDriver(winnerField.value)?.driverId || '');

    if ((!poleField.disabled && poleField.value.trim() && !poleDriver) || (!winnerField.disabled && winnerField.value.trim() && !winnerDriver)) {
      $('tipsStatus').textContent = 'Nem ismertem fel az egyik pilótanevet. Válassz a felajánlott nevek közül, vagy írd be a hivatalos vezetéknevet.';
      return;
    }
    if (
      (!poleField.disabled && !poleDriver) ||
      (!timeField.disabled && !poleTime) ||
      (!winnerField.disabled && !winnerDriver)
    ) {
      $('tipsStatus').textContent =
        'Tölts ki minden még nyitott tippmezőt.';
      return;
    }

    if (
      !timeField.disabled &&
      !/^\d+:\d{2}\.\d{3}$/.test(poleTime)
    ) {
      $('tipsStatus').textContent =
        'A pole idő formátuma például: 1:32.456';
      return;
    }

    const tipData = {
  raceId,
  raceName: option.dataset.raceName || option.textContent,
  eventType: isSprint ? 'sprint' : 'gp',
  poleDriver,
  poleTime,
  winnerDriver,
  updatedAt: serverTimestamp()
};

// Az eredeti, privát tipp mentése.
await setDoc(tipRef, tipData);

// A tipp megosztása minden olyan csoportban,
// amelynek a bejelentkezett játékos tagja.
const groupsSnap = await getDocs(collection(db, 'groups'));

for (const groupDoc of groupsSnap.docs) {
  const memberRef = doc(
    db, 'groups', groupDoc.id, 'members', currentUser.uid
  );

  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) continue;

  await setDoc(
    doc(db, 'groups', groupDoc.id, 'tips',
        `${currentUser.uid}_${raceId}`),
    {
      ...tipData,
      uid: currentUser.uid,
      username: memberSnap.data().username || 'Versenyző',
      groupId: groupDoc.id
    }
  );
}

$('tipsStatus').textContent = isSprint
  ? 'Sprinttippek sikeresen elmentve!'
  : 'GP-tippek sikeresen elmentve!';

    $('tipsStatus').textContent = isSprint
      ? 'Sprinttippek sikeresen elmentve!'
      : 'GP-tippek sikeresen elmentve!';
  } catch (error) {
    console.error('Tippmentési hiba:', error);
    $('tipsStatus').textContent =
      'Mentési hiba: ' + error.message;
  } finally {
    $('saveTipsButton').disabled = false;
  }
}

function showRaceSchedule() {
  const select = $('tipRaceSelect');
  const option = select.options[select.selectedIndex];

  if (!option || !option.value) {
    $('tipRaceInfo').textContent = 'Válassz egy futamot.';
    return;
  }

  function formatSession(name, date, time) {
    if (!date) return '';

    const dateTime = time
      ? new Date(`${date}T${time}`)
      : new Date(`${date}T00:00:00Z`);

    if (Number.isNaN(dateTime.getTime())) return '';

    const formatted = new Intl.DateTimeFormat('hu-HU', {
      timeZone: 'Europe/Budapest',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(dateTime);

    return `${name}: ${formatted}`;
  }

  const sessions = [
    formatSession(
      'Sprint időmérő',
      option.dataset.sprintQualifyingDate,
      option.dataset.sprintQualifyingTime
    ),
    formatSession(
      'Sprint',
      option.dataset.sprintDate,
      option.dataset.sprintTime
    ),
    formatSession(
      'Normál időmérő',
      option.dataset.qualifyingDate,
      option.dataset.qualifyingTime
    ),
    formatSession(
      'Nagydíj',
      option.dataset.raceDate,
      option.dataset.raceTime
    )
  ].filter(Boolean);

  $('tipRaceInfo').textContent = sessions.length
    ? sessions.join(' | ')
    : 'Ehhez a futamhoz nem érkezett minden eseményhez időpont az API-ból.';
}



function updateTipLocks() {
  const select = $('tipRaceSelect');
  const option = select.options[select.selectedIndex];

  const poleField = $('tipPoleDriver');
  const timeField = $('tipPoleTime');
  const winnerField = $('tipWinnerDriver');

  if (!option || !option.value) {
    poleField.disabled = false;
    timeField.disabled = false;
    winnerField.disabled = false;
    return;
  }

  const isSprint = option.dataset.eventType === 'sprint';

  function deadlinePassed(date, time) {
    if (!date) return false;

    const utcTime = time
      ? (time.endsWith('Z') ? time : `${time}Z`)
      : '00:00:00Z';

    const deadline = new Date(`${date}T${utcTime}`);

    return !Number.isNaN(deadline.getTime()) &&
      Date.now() >= deadline.getTime();
  }

  const poleLocked = isSprint
    ? deadlinePassed(
        option.dataset.sprintQualifyingDate,
        option.dataset.sprintQualifyingTime
      )
    : deadlinePassed(
        option.dataset.qualifyingDate,
        option.dataset.qualifyingTime
      );

  const winnerLocked = isSprint
    ? deadlinePassed(
        option.dataset.sprintDate,
        option.dataset.sprintTime
      )
    : deadlinePassed(
        option.dataset.raceDate,
        option.dataset.raceTime
      );

  poleField.disabled = poleLocked;

  // A sprint event does not use the normal GP pole-time field.
  timeField.disabled = poleLocked;

  winnerField.disabled = winnerLocked;
}



$('tipRaceSelect').addEventListener('change', showRaceSchedule);
$('tipRaceSelect').addEventListener('change', loadSavedTip);
$('tipRaceSelect').addEventListener('change', updateTipLocks);
$('tipRaceSelect').addEventListener('change', loadTipReferenceData);
function formatPoleTimeAsTyped(raw) {
  const original = String(raw || '').trim();
  if (!original) return '';
  // Ha a felhasználó már teljesen formázott időt ír be, a számjegyekből újraépítjük.
  // A beírás közben automatikusan megjelenik a kettőspont és a tizedespont.
  const digits = original.replace(/\D/g, '').slice(0, 6);
  if (!digits) return '';
  if (digits.length === 1) return digits;
  if (digits.length === 2) return `${digits[0]}:${digits.slice(1)}`;
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1, 3)}`;
  return `${digits[0]}:${digits.slice(1, 3)}.${digits.slice(3)}`;
}
$('tipPoleTime').addEventListener('input', event => {
  const field = event.currentTarget;
  const formatted = formatPoleTimeAsTyped(field.value);
  if (field.value !== formatted) {
    field.value = formatted;
    try { field.setSelectionRange(field.value.length, field.value.length); } catch (_) {}
  }
  updateTipPredictionWarning();
});
$('tipPoleTime').addEventListener('blur', () => { $('tipPoleTime').value = normalizePoleTimeInput($('tipPoleTime').value); updateTipPredictionWarning(); });
$('saveTipsButton').addEventListener('click', saveTips);
setInterval(() => {
  updateTipLocks();
}, 30000);

// APEX profil és választható, stilizált sisakavatárok
const helmetCatalog = [
 {id:'senna-1988',name:'Ayrton Senna',year:'1988',team:'McLaren',era:'classic',tag:'CLASSIC',style:'helmet-classic',desc:'A klasszikus sárga sisak ikonikus korszakának hangulata.'},
 {id:'lauda-1976',name:'Niki Lauda',year:'1976',team:'Ferrari',era:'classic',tag:'CLASSIC',style:'helmet-ferrari',desc:'A hetvenes évek letisztult, klasszikus versenysisak-stílusa.'},
 {id:'hunt-1976',name:'James Hunt',year:'1976',team:'McLaren',era:'classic',tag:'CLASSIC',style:'helmet-mclaren',desc:'Retró, nagy kontrasztú sisakdizájn klasszikus versenyhangulattal.'},
 {id:'villeneuve-1979',name:'Gilles Villeneuve',year:'1979',team:'Ferrari',era:'classic',tag:'CLASSIC',style:'helmet-ferrari',desc:'Klasszikus piros-fehér versenysisak által inspirált avatár.'},
 {id:'schumacher-2000',name:'Michael Schumacher',year:'2000',team:'Ferrari',era:'champion',tag:'BAJNOK',style:'helmet-ferrari',desc:'A Ferrari korszak és a 2000-es világbajnoki szezon által inspirált avatár.'},
 {id:'alonso-2005',name:'Fernando Alonso',year:'2005',team:'Renault',era:'champion',tag:'BAJNOK',style:'helmet-mclaren',desc:'A 2005-ös bajnoki szezon kék-sárga hangulatát idéző avatár.'},
 {id:'vettel-2010',name:'Sebastian Vettel',year:'2010',team:'Red Bull',era:'champion',tag:'BAJNOK',style:'helmet-redbull',desc:'A Red Bull első világbajnoki korszakát idéző dizájn.'},
 {id:'hamilton-2020',name:'Lewis Hamilton',year:'2020',team:'Mercedes',era:'champion',tag:'BAJNOK',style:'helmet-mercedes',desc:'A Mercedes domináns korszakából inspirálódó türkiz-fekete sisak.'},
 {id:'verstappen-2023',name:'Max Verstappen',year:'2023',team:'Red Bull',era:'modern',tag:'MODERN',style:'helmet-redbull',desc:'Modern, kék-piros versenyhangulat.'},
 {id:'raikkonen-2007',name:'Kimi Räikkönen',year:'2007',team:'Ferrari',era:'modern',tag:'BAJNOK',style:'helmet-ferrari',desc:'A 2007-es bajnoki szezon ihlette piros-fehér avatár.'},
 {id:'norris-2024',name:'Lando Norris',year:'2024',team:'McLaren',era:'current',tag:'AKTUÁLIS',style:'helmet-mclaren',desc:'Modern papaya narancsos színvilág.'},
 {id:'leclerc-2024',name:'Charles Leclerc',year:'2024',team:'Ferrari',era:'current',tag:'AKTUÁLIS',style:'helmet-ferrari',desc:'Ferrari-piros, modern sisakstílus.'},
 {id:'piastri-2024',name:'Oscar Piastri',year:'2024',team:'McLaren',era:'current',tag:'AKTUÁLIS',style:'helmet-mclaren',desc:'Letisztult, narancsos modern avatár.'},
 {id:'russell-2024',name:'George Russell',year:'2024',team:'Mercedes',era:'current',tag:'AKTUÁLIS',style:'helmet-mercedes',desc:'Ezüstös-türkiz modern sisakstílus.'},
 {id:'purple-apex',name:'Apex Nightfall',year:'APEX',team:'APEX Original',era:'modern',tag:'APEX ORIGINAL',style:'helmet-purple',desc:'Saját APEX-stílusú, lila-fekete sisakavatár.'},
 {id:'williams-blue',name:'Classic Blue',year:'APEX',team:'Williams ihlette',era:'classic',tag:'APEX ORIGINAL',style:'helmet-williams',desc:'Klasszikus kék-fehér színvilágú saját avatár.'}
];
let selectedHelmetId='schumacher-2000', previewHelmetId='schumacher-2000', helmetFilter='all';
const teamNames={ferrari:'Ferrari',mclaren:'McLaren',mercedes:'Mercedes',redbull:'Red Bull',williams:'Williams',astonmartin:'Aston Martin',alpine:'Alpine',racingbulls:'Racing Bulls',audi:'Audi',haas:'Haas'};
const driverNames={leclerc:'Charles Leclerc',hamilton:'Lewis Hamilton',verstappen:'Max Verstappen',norris:'Lando Norris',piastri:'Oscar Piastri',russell:'George Russell',alonso:'Fernando Alonso',sainz:'Carlos Sainz'};
function helmetFor(id){return helmetCatalog.find(h=>h.id===id)||helmetCatalog[4];}
function updateProfileIdentity(d={}){const h=helmetFor(d.helmetId||selectedHelmetId);selectedHelmetId=d.helmetId||selectedHelmetId;const name=d.username||d.displayName||currentUser?.displayName||'Versenyző';$('profileDisplayName').textContent=name;$('profileMeta').textContent=`${teamNames[d.team]||'Ferrari'}-szurkoló · APEX F1 Tipp 2026`;$('profileUsername').textContent=d.username||'Nincs megadva';$('profileTeam').textContent=teamNames[d.team]||'Ferrari';$('profileDriver').textContent=driverNames[d.favoriteDriver]||'Charles Leclerc';$('profileAvatarLarge').className=`helmet-avatar ${h.style}`;$('profileAvatarLarge').innerHTML='<span class="helmet-visor"></span>'; $('profileBadgeRow').innerHTML='<span class="profile-badge">🏁 APEX GRID MEMBER</span>';renderHelmetGallery();}
function renderHelmetGallery(){const q=($('helmetSearch')?.value||'').toLocaleLowerCase('hu'),f=$('helmetYearFilter')?.value||helmetFilter;const list=helmetCatalog.filter(h=>(f==='all'||h.era===f)&&(`${h.name} ${h.year} ${h.team}`.toLocaleLowerCase('hu').includes(q)));$('helmetGallery').innerHTML=list.map(h=>`<button class="helmet-card ${h.id===previewHelmetId?'selected':''}" data-helmet-id="${h.id}"><span class="helmet-art"><span class="helmet-avatar ${h.style}"><span class="helmet-visor"></span></span></span><span class="helmet-card-copy"><strong>${h.name}</strong><small>${h.year} · ${h.team}</small><span class="helmet-tag">${h.tag}</span></span></button>`).join('')||'<p class="subtle">Nincs találat a keresésre.</p>';document.querySelectorAll('[data-helmet-id]').forEach(b=>b.addEventListener('click',()=>selectHelmet(b.dataset.helmetId)));const h=helmetFor(previewHelmetId);$('helmetPreviewArt').className=`helmet-preview-art ${h.style}`;$('helmetPreviewArt').innerHTML=`<span class="helmet-avatar ${h.style}"><span class="helmet-visor"></span></span>`;$('helmetPreviewTag').textContent=h.tag;$('helmetPreviewName').textContent=`${h.name} · ${h.year}`;$('helmetPreviewMeta').textContent=`${h.team} · ${h.era==='champion'?'Világbajnoki szezon':h.era==='classic'?'Classic Legends':h.era==='current'?'Aktuális mezőny':'Modern Icons'}`;$('helmetPreviewDescription').textContent=h.desc;$('saveHelmetButton').textContent=h.id===selectedHelmetId?'✓ Ez a jelenlegi avatárod':'✓ Ezt az avatárt választom';}
function selectHelmet(id){previewHelmetId=id;renderHelmetGallery();}
document.querySelectorAll('[data-helmet-filter]').forEach(b=>b.addEventListener('click',()=>{helmetFilter=b.dataset.helmetFilter;document.querySelectorAll('[data-helmet-filter]').forEach(x=>x.classList.toggle('active',x===b));$('helmetYearFilter').value=helmetFilter;renderHelmetGallery();}));$('helmetSearch').addEventListener('input',renderHelmetGallery);$('helmetYearFilter').addEventListener('change',e=>{helmetFilter=e.target.value;document.querySelectorAll('[data-helmet-filter]').forEach(x=>x.classList.toggle('active',x.dataset.helmetFilter===helmetFilter));renderHelmetGallery();});
$('saveHelmetButton').addEventListener('click',async()=>{if(!currentUser){$('helmetSaveStatus').textContent='A mentéshez jelentkezz be.';return;}selectedHelmetId=previewHelmetId;const b=$('saveHelmetButton');b.disabled=true;$('helmetSaveStatus').textContent='Mentés…';try{await setDoc(doc(db,'users',currentUser.uid),{helmetId:selectedHelmetId,updatedAt:serverTimestamp()},{merge:true});const h=helmetFor(selectedHelmetId);$('profileAvatarLarge').className=`helmet-avatar ${h.style}`;$('profileAvatarLarge').innerHTML='<span class="helmet-visor"></span>';const av=$('headerAvatar');av.src='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#101820"/><path d="M20 52 Q16 18 50 12 Q84 18 80 52 L72 77 L28 77Z" fill="${({ 'helmet-ferrari':'#e10600','helmet-mclaren':'#ff8000','helmet-mercedes':'#00d7b8','helmet-redbull':'#3671c6','helmet-classic':'#f4d23c','helmet-williams':'#1765d1','helmet-purple':'#6940a5'}[h.style]||'#e10600')}"/><path d="M23 47 Q50 37 77 47 L72 62 Q50 70 28 62Z" fill="#111923" stroke="#b9c6d4" stroke-width="3"/></svg>`);av.classList.remove('hidden');$('helmetSaveStatus').textContent='Az avatár elmentve a profilodba.';renderHelmetGallery();toast('Avatár mentve.');}catch(e){$('helmetSaveStatus').textContent='Mentési hiba: '+e.message;}finally{b.disabled=false;}});
$('profileEditButton').addEventListener('click',()=>{if(!currentUser)return;$('settingsOverlay').classList.remove('hidden');});
async function loadProfileStats(){if(!currentUser)return;try{const snap=await getDoc(doc(db,'users',currentUser.uid));const d=snap.exists()?snap.data():{};updateProfileIdentity(d);const scoresSnap=await getDocs(collection(db,'users',currentUser.uid,'scores'));let total=0,hits=0,best=0; scoresSnap.forEach(x=>{const v=x.data();total+=Number(v.points||v.totalPoints||0);hits+=Number(v.hits||v.correctCount||0);best=Math.max(best,Number(v.points||v.totalPoints||0));});$('profilePoints').textContent=total||'—';$('profileHits').textContent=hits||'—';$('profileBest').textContent=best||'—';$('profileRank').textContent='—';}catch(e){console.info('Profilstatisztika nem elérhető',e);$('profilePoints').textContent='—';$('profileHits').textContent='—';$('profileBest').textContent='—';$('profileRank').textContent='—';}}

function showOnlyPage(pageId) {
  const content = document.querySelector('.content');
  if (!content) return;
  [...content.children].forEach(el => {
    const isFooter = el.classList.contains('footer');
    const isPage = ['tipsPage', 'groupsPage', 'rankingPage', 'statsPage', 'calendarPage', 'profilePage'].includes(el.id);
    if (isPage) el.classList.toggle('hidden', el.id !== pageId);
    else el.classList.toggle('hidden', pageId !== 'home' && !isFooter);
  });
  if (pageId === 'home') {
    [...content.children].forEach(el => {
      if (!['tipsPage', 'groupsPage', 'rankingPage', 'statsPage', 'calendarPage', 'profilePage'].includes(el.id)) el.classList.remove('hidden');
    });
  }
}
function showTipsPage() {
  if (!$('tipsPage')) return toast('A tippoldal HTML-része hiányzik.');
  showOnlyPage('tipsPage');
}
function showHomePage() {
  showOnlyPage('home');
}
function openSection(key) {
  if (key === 'profile') { if (!currentUser) { $('loginOverlay').classList.remove('hidden'); $('loginStatus').textContent = 'A profilod megtekintéséhez jelentkezz be.'; return; } showOnlyPage('profilePage'); loadProfileStats(); return; }
  if (key === 'settings') {
    if (!currentUser) {
      $('loginOverlay').classList.remove('hidden');
      $('loginStatus').textContent = 'A beállításokhoz jelentkezz be.';
      return;
    }
    $('settingsOverlay').classList.remove('hidden');
    return;
  }
  if (key === 'tips') { goTips(); return; }
  if (key === 'home') { showHomePage(); return; }
  if (key === 'teams') { showGroupsPage(); return; }
  if (key === 'ranking') { showOnlyPage('rankingPage'); loadScoreboard(); return; }
  if (key === 'stats') { showOnlyPage('statsPage'); loadScoreboard(); return; }
  if (key === 'calendar') { showOnlyPage('calendarPage'); initCalendar(); return; }
  showHomePage();
  const messages = {
    drivers: 'A pilótalista bekötése következik.',
    rules: 'A játékszabályok bekötése következik.'
  };
  toast(messages[key] || 'Ez a nézet később készül el.');
}


// APEX naptár: lista, havi nézet és pályafelfedező
let calRaces=[],calFilter='all',calView='list',calMonth=new Date(Date.UTC(2026,2,1)),calSelected=null,calLoaded=false;
const calFlags={Australia:'🇦🇺',China:'🇨🇳',Japan:'🇯🇵',Bahrain:'🇧🇭','Saudi Arabia':'🇸🇦','United States':'🇺🇸',Canada:'🇨🇦',Monaco:'🇲🇨',Spain:'🇪🇸',Austria:'🇦🇹','United Kingdom':'🇬🇧',Hungary:'🇭🇺',Belgium:'🇧🇪',Netherlands:'🇳🇱',Italy:'🇮🇹',Azerbaijan:'🇦🇿',Singapore:'🇸🇬',Mexico:'🇲🇽',Brazil:'🇧🇷',Qatar:'🇶🇦','United Arab Emirates':'🇦🇪'};
function ce(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cf(r){const url=r._openf1?.country_flag;return url?`<img class="flag-img" src="${ce(url)}" alt="${ce(r.Circuit?.Location?.country||'Ország zászlaja')}" loading="lazy" onerror="this.style.display='none'">`:`<img class="flag-img" src="https://flagcdn.com/w40/${countryIso(r.Circuit?.Location?.country)}.png" alt="${ce(r.Circuit?.Location?.country||'Ország zászlaja')}" loading="lazy" onerror="this.outerHTML='🏁'">`; }
function countryIso(country){const m={'Australia':'au','China':'cn','Japan':'jp','Bahrain':'bh','Saudi Arabia':'sa','United States':'us','Canada':'ca','Monaco':'mc','Spain':'es','Austria':'at','United Kingdom':'gb','Hungary':'hu','Belgium':'be','Netherlands':'nl','Italy':'it','Azerbaijan':'az','Singapore':'sg','Mexico':'mx','Brazil':'br','Qatar':'qa','United Arab Emirates':'ae','Portugal':'pt','France':'fr','Germany':'de','Russia':'ru','Turkey':'tr','South Korea':'kr'};return m[country]||'un';}
const OPENF1='https://api.openf1.org/v1';
function openF1For(r){return r._openf1||{};}
function cd(r,o={day:'numeric',month:'long',year:'numeric'}){return new Date(`${r.date}T${r.time||'12:00:00Z'}`).toLocaleDateString('hu-HU',{...o,timeZone:'UTC'});}
function cs(r){return r._eventType==='sprint';}
function cv(){return calRaces.filter(r=>calFilter==='all'||(calFilter==='sprint'?cs(r):!cs(r)));}
function cn(r){return String(r.raceName||'Formula 1 futam').replace(/\s*Grand Prix\s*/i,' Nagydíj').replace(/\s+/g,' ').trim();}
function cmeta(r){const p=profileFor(r);return `<span class="meta-chip">▦ ${ce(cd(r))}</span><span class="meta-chip">⌁ ${p.length?p.length.toFixed(3).replace('.',',')+' km':'–'}</span><span class="meta-chip">◉ ${p.laps||'–'} kör</span>`;}
function cnext(){const r=calRaces.find(x=>new Date(`${x.date}T${x.time||'12:00:00Z'}`).getTime()>Date.now())||calRaces.at(-1);if(!r)return;$('calendarNext').innerHTML=`<div><span class="status-pill">KÖVETKEZŐ FUTAM</span><h2>${ce(cn(r))}</h2><p>${ce(r.Circuit?.circuitName||'')} · ${ce(r.Circuit?.Location?.locality||'')}, ${ce(r.Circuit?.Location?.country||'')}</p><div class="next-meta">${cmeta(r)}</div></div><div class="race-flag" style="width:72px;height:48px;font-size:36px">${cf(r)}</div>`;}
function clist(){const rs=cv();$('calendarCount').textContent=`${calRaces.length} futamhétvége · 2026`;$('calendarListCount').textContent=`${rs.length} esemény`;$('calendarRaceList').innerHTML=rs.map(r=>{let sp=cs(r),key=`${r.round}-${r._eventType||'gp'}`,opened=String(calSelected)===key;return `<div class="calendar-race-wrap"><button class="calendar-race ${sp?'sprint':''} ${opened?'expanded':''}" data-cr="${ce(r.round)}" data-event="${ce(r._eventType||'gp') }" aria-expanded="${opened}"><span class="race-number">${ce(r.round)}.</span><span class="race-flag">${cf(r)}</span><span class="race-main"><strong>${ce(cn(r))}${sp?' – Sprint':''}</strong><small>${ce(r.Circuit?.circuitName||'')} · ${ce(r.Circuit?.Location?.locality||'')}</small></span><span class="race-date">${ce(cd(r,{day:'numeric',month:'short'}))}</span><span class="race-type ${sp?'sprint':''}">${sp?'SPRINT':'NAGYDÍJ'}</span><span class="race-open">${opened?'Bezárás ↑':'Részletek ↓'}</span></button><div class="calendar-inline-detail ${opened?'':'hidden'}" id="inline-detail-${key}"></div></div>`}).join('')||'<div class="loading-state">Nincs esemény ebben a szűrésben.</div>';$('calendarRaceList').querySelectorAll('[data-cr]').forEach(b=>b.onclick=()=>ctoggleInline(b.dataset.cr,b.dataset.event));if(calSelected){const r=rs.find(x=>`${x.round}-${x._eventType||'gp'}`===String(calSelected));if(r)renderCircuitDetail(r,`inline-detail-${calSelected}`);}}
function ctoggleInline(round,eventType){const key=`${round}-${eventType||'gp'}`;if(String(calSelected)===key){calSelected=null;clist();return;}calSelected=key;clist();const r=cv().find(x=>`${x.round}-${x._eventType||'gp'}`===key);if(r)renderCircuitDetail(r,`inline-detail-${key}`);}

function cmonth(){let y=calMonth.getUTCFullYear(),m=calMonth.getUTCMonth(),off=(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7,days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),prev=new Date(Date.UTC(y,m,0)).getUTCDate();$('calendarMonthTitle').textContent=calMonth.toLocaleDateString('hu-HU',{month:'long',year:'numeric',timeZone:'UTC'});let out=['H','K','SZE','CS','P','SZO','V'].map(n=>`<div class="month-day-name">${n}</div>`).join('');for(let i=0;i<42;i++){let d=i-off+1,inside=d>0&&d<=days,num=d<1?prev+d:d>days?d-days:d,key=`${y}-${String(m+1).padStart(2,'0')}-${String(num).padStart(2,'0')}`,ev=inside?cv().filter(r=>r.date===key):[];out+=`<div class="month-cell ${inside?'':'muted'}"><span class="day-num">${num}</span>${ev.map(r=>`<button class="month-event ${cs(r)?'sprint':''}" data-cm="${ce(r.round)}"><span>${cf(r)} ${ce(cn(r))}</span><span>${cs(r)?'Sprint':'Nagydíj'}</span></button>`).join('')}</div>`;}$('calendarMonthGrid').innerHTML=out;$('calendarMonthGrid').querySelectorAll('[data-cm]').forEach(b=>b.onclick=()=>cselect(b.dataset.cm));let ev=cv().filter(r=>{let d=new Date(r.date+'T12:00:00Z');return d.getUTCFullYear()===y&&d.getUTCMonth()===m});$('calendarMonthEvents').innerHTML=ev.map(r=>`<button class="calendar-race ${cs(r)?'sprint':''}" data-cr="${ce(r.round)}"><span class="race-number">${r.round}.</span><span class="race-flag">${cf(r)}</span><span class="race-main"><strong>${ce(cn(r))}${cs(r)?' – Sprint':''}</strong><small>${ce(r.Circuit?.circuitName||'')}</small></span><span class="race-date">${ce(cd(r))}</span><span class="race-type ${cs(r)?'sprint':''}">${cs(r)?'SPRINT':'NAGYDÍJ'}</span></button>`).join('')||'<div class="loading-state">Ebben a hónapban nincs futam.</div>';$('calendarMonthEvents').querySelectorAll('[data-cr]').forEach(b=>b.onclick=()=>cselect(b.dataset.cr));}
function csvg(n){let paths=['M45 110 L58 62 L94 38 L145 46 L177 22 L225 35 L250 68 L236 102 L198 120 L173 145 L121 151 L86 132 Z','M35 105 L58 62 L105 45 L132 70 L175 28 L226 40 L245 80 L220 112 L176 100 L154 139 L101 143 L75 121 Z','M38 83 L68 43 L119 34 L157 57 L195 34 L238 57 L245 101 L206 133 L164 112 L123 145 L75 128 Z'];let d=paths[Math.abs(+n||0)%3];return `<svg class="track-svg" viewBox="0 0 280 180" role="img" aria-label="Sematikus pályarajz"><path d="${d}"/><path class="track-inner" d="${d}"/><circle cx="45" cy="110" r="5" fill="#f20a24"/><text x="58" y="105" fill="#72bfff" font-size="10">START</text></svg>`;}
function ctrack(){let rs=cv();$('calendarTrackPicker').innerHTML=rs.map(r=>`<button class="track-pick ${String(r.round)===String(calSelected)?'active':''}" data-ct="${ce(r.round)}"><span class="race-flag">${cf(r)}</span><span><strong>${ce(cn(r))}</strong><small>${ce(r.Circuit?.Location?.locality||'')} · ${ce(cd(r,{day:'numeric',month:'short'}))}</small></span></button>`).join('');$('calendarTrackPicker').querySelectorAll('[data-ct]').forEach(b=>b.onclick=()=>{calSelected=b.dataset.ct;ctrack();});let r=rs.find(x=>String(x.round)===String(calSelected))||rs[0];if(!r){$('calendarTrackDetail').innerHTML='<div class="loading-state">Nincs pályaadat.</div>';return;}renderCircuitDetail(r,'calendarTrackDetail');}
function renderCircuitDetail(r,targetId){const sessionId=`openf1SessionData-${targetId}`;let p=profileFor(r),o=openF1For(r),img=o.circuit_image?`<img class="openf1-circuit-image" src="${ce(o.circuit_image)}" alt="${ce(o.circuit_short_name||cn(r))} pályarajza" loading="lazy">`:csvg(r.round);$(targetId).innerHTML=`<div class="track-detail-head"><div><h2>${cf(r)} ${ce(cn(r))}</h2><p>${ce(r.Circuit?.circuitName||'')} · ${ce(r.Circuit?.Location?.locality||'')}, ${ce(r.Circuit?.Location?.country||'')}</p></div><span class="track-number">${ce(r.round)}. futam</span></div><div class="track-map-wrap">${img}<div class="track-stats"><div class="track-stat"><small>PÁLYAHOSSZ</small><strong>${p.length?p.length.toFixed(3).replace('.',',')+' km':'–'}</strong></div><div class="track-stat"><small>KÖRÖK</small><strong>${p.laps||'–'}</strong></div><div class="track-stat"><small>KANYAROK</small><strong>${p.corners||'–'}</strong></div><div class="track-stat"><small>VERSENYTÁV</small><strong>${p.length&&p.laps?(p.length*p.laps).toFixed(3).replace('.',',')+' km':'–'}</strong></div></div></div><div class="track-facts"><strong>Helyszín:</strong> ${ce(r.Circuit?.Location?.locality||'–')}, ${ce(r.Circuit?.Location?.country||'–')}<br><strong>Dátum:</strong> ${ce(cd(r))}<br><strong>Pályatípus:</strong> ${ce(o.circuit_type||'–')}<br><strong>Hivatalos eseménynév:</strong> ${ce(o.meeting_official_name||'–')}<br><strong>Pályainformáció:</strong> ${ce(p.fact||'A pályaprofil részletes adatai később bővíthetők.')}<div id="${sessionId}" class="openf1-session-data"><div class="loading-state">OpenF1 történeti időjárás- és gum adatok ellenőrzése…</div></div>${o.circuit_info_url?`<p><a class="openf1-link" href="${ce(o.circuit_info_url)}" target="_blank" rel="noopener">Részletes pályainformáció ↗</a></p>`:''}<small>Forrás: OpenF1 + Jolpica. Az OpenF1 ingyenes hozzáférése történeti adatokat biztosít 2023-tól; élő adatokhoz előfizetés szükséges.</small></div>`;loadOpenF1Session(r,sessionId).catch(e=>{console.info('OpenF1 session data unavailable',e);const el=$(sessionId);if(el)el.innerHTML='<p>Ehhez a hétvégéhez még nincs elérhető történeti időjárás- vagy gumadat.</p>';});}
async function loadOpenF1Session(r,sessionId='openf1SessionData'){const el=$(sessionId);if(!el)return;const meeting=openF1For(r);if(!meeting?.meeting_key){el.innerHTML='<p>Ehhez az eseményhez jelenleg nincs OpenF1-adat.</p>';return;}const cacheKey='openf1-'+meeting.meeting_key;if(window.__apexOpenF1Cache?.[cacheKey]){renderOpenF1Session(window.__apexOpenF1Cache[cacheKey],sessionId);return;}const sessionsRes=await fetch(`${OPENF1}/sessions?meeting_key=${meeting.meeting_key}`);if(!sessionsRes.ok)throw Error('sessions HTTP '+sessionsRes.status);const sessions=await sessionsRes.json();const completed=sessions.filter(x=>x.session_key&&new Date(x.date_end||x.date_start).getTime()<Date.now()).sort((a,b)=>new Date(b.date_end||b.date_start)-new Date(a.date_end||a.date_start));const chosen=completed.find(x=>/Race/i.test(x.session_name||''))||completed.find(x=>/Qualifying/i.test(x.session_name||''))||completed[0];let payload={session:chosen||null,weather:null,compounds:[]};if(chosen){const jobs=await Promise.allSettled([fetch(`${OPENF1}/weather?session_key=${chosen.session_key}`).then(x=>x.ok?x.json():[]),fetch(`${OPENF1}/stints?session_key=${chosen.session_key}`).then(x=>x.ok?x.json():[])]);if(jobs[0].status==='fulfilled')payload.weather=jobs[0].value; if(jobs[1].status==='fulfilled')payload.compounds=[...new Set(jobs[1].value.map(x=>x.compound).filter(Boolean))];}window.__apexOpenF1Cache=window.__apexOpenF1Cache||{};window.__apexOpenF1Cache[cacheKey]=payload;renderOpenF1Session(payload,sessionId);}
function renderOpenF1Session(d,sessionId='openf1SessionData'){const el=$(sessionId);if(!el)return;if(!d.session){el.innerHTML='<h3>OpenF1 hétvége-adatok</h3><p>A hétvége még nem rendelkezik befejezett OpenF1-mérésekkel. A pálya és a zászló adatai ettől még megjelenhetnek.</p>';return;}const w=d.weather?.length?d.weather[d.weather.length-1]:null;el.innerHTML=`<h3>OpenF1 · ${ce(d.session.session_name||'Legutóbbi elérhető szekció')}</h3><div class="openf1-data-grid"><div><small>GUMIKEVERÉKEK (HASZNÁLT)</small><strong>${d.compounds.length?d.compounds.map(ce).join(' · '):'Nincs adat'}</strong></div><div><small>LEVEGŐ / PÁLYA</small><strong>${w?`${w.air_temperature??'–'}°C / ${w.track_temperature??'–'}°C`:'Nincs időjárásadat'}</strong></div><div><small>PÁRATARTALOM</small><strong>${w&&w.humidity!=null?w.humidity+'%':'–'}</strong></div><div><small>ESŐ</small><strong>${w?(w.rainfall?'Igen':'Nem'):'–'}</strong></div></div><p class="openf1-note">A gumikeverékek a kiválasztott korábbi szekcióban ténylegesen használt keverékek, nem a Pirelli előzetes hétvégi kiosztása. Az időjárás az utolsó elérhető mérés.</p>`;}
function cselect(round){calSelected=String(round);clist();cmonth();ctrack();cset('track');}
function cset(v){calView=v;document.querySelectorAll('[data-cal-view]').forEach(b=>b.classList.toggle('active',b.dataset.calView===v));$('calendarListView').classList.toggle('hidden',v!=='list');$('calendarMonthView').classList.toggle('hidden',v!=='month');$('calendarTrackView').classList.toggle('hidden',v!=='track');if(v==='list')clist();if(v==='month')cmonth();if(v==='track')ctrack();}
async function initCalendar(){if(!calLoaded){try{const scheduleSnap=await getDoc(doc(db,'raceCalendars','2026'));if(!scheduleSnap.exists())throw Error('A Firestore raceCalendars/2026 dokumentum nem található.');const scheduleData=scheduleSnap.data()||{};const sourceRaces=Array.isArray(scheduleData.events)?scheduleData.events:[];if(!sourceRaces.length)throw Error('Üres Firestore versenynaptár');let meetings=[];try{const openRes=await fetch(`${OPENF1}/meetings?year=2026`);if(openRes.ok)meetings=await openRes.json();}catch(e){console.info('OpenF1 meeting adatok most nem érhetők el',e);}const enrich=r=>{const country=r.Circuit?.Location?.country||'';const raceName=String(r.raceName||'').toLowerCase();const circuit=String(r.Circuit?.circuitName||'').toLowerCase();const norm=v=>String(v||'').toLowerCase().replace(/grand prix|formula 1|airlines|crypto.com|aramco|pirelli|qatar airways|lenovo|aws|heineken|singapore airlines|las vegas strip|round|\s+/g,' ').trim();const rn=norm(raceName),cnm=norm(circuit);const m=meetings.find(x=>{const mn=norm(x.meeting_name),sn=norm(x.circuit_short_name);return mn&&((rn&&(rn.includes(mn)||mn.includes(rn)))||(cnm&&sn&&(cnm.includes(sn)||sn.includes(cnm))));})||meetings.find(x=>String(x.country_name||'').toLowerCase()===country.toLowerCase()&&!['United States'].includes(country));return {...r,_openf1:m||null};};calRaces=sourceRaces.flatMap(raw=>{const r=enrich(raw);const out=[{...r,_eventType:'gp'}];if(r.Sprint?.date)out.push({...r,date:r.Sprint.date,time:r.Sprint.time||'12:00:00Z',_eventType:'sprint'});return out;});calLoaded=true;calSelected=String(calRaces[0].round);cnext();clist();cmonth();ctrack();}catch(e){console.error(e);$('calendarRaceList').innerHTML='<div class="loading-state">A Firestore versenynaptár most nem tölthető be. Ellenőrizd a raceCalendars/2026 dokumentumot.</div>';return;}}cset(calView);}
document.querySelectorAll('[data-cal-view]').forEach(b=>b.addEventListener('click',()=>cset(b.dataset.calView)));
document.querySelectorAll('[data-cal-filter]').forEach(b=>b.addEventListener('click',()=>{calFilter=b.dataset.calFilter;document.querySelectorAll('[data-cal-filter]').forEach(x=>x.classList.toggle('active',x===b));clist();cmonth();ctrack();}));
$('calendarPrevMonth')?.addEventListener('click',()=>{calMonth=new Date(Date.UTC(calMonth.getUTCFullYear(),calMonth.getUTCMonth()-1,1));cmonth();});
$('calendarNextMonth')?.addEventListener('click',()=>{calMonth=new Date(Date.UTC(calMonth.getUTCFullYear(),calMonth.getUTCMonth()+1,1));cmonth();});


document.querySelectorAll('[data-nav]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-nav]').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    openSection(button.dataset.nav);
  });
});


// -----------------------------------------------------------------------------
// Csoportok: létrehozás, meghívókódos csatlakozás, saját csoportok listázása
// Kizárólag a teszt Firebase projektet használja.
// -----------------------------------------------------------------------------
function showGroupsPage() {
  const content = document.querySelector('.content');
  const page = $('groupsPage');
  if (!content || !page) return toast('A csoportoldal HTML-része hiányzik.');
  [...content.children].forEach(el => {
    el.classList.toggle('hidden', el !== page && !el.classList.contains('footer'));
  });
  page.classList.remove('hidden');
  loadMyGroups();
}

function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function escapeGroupText(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}


async function loadMyGroups() {
  const status = $('groupsStatus');
  const list = $('myGroupsList');

  if (!status || !list) return;

  if (!currentUser) {
    status.textContent =
      'A csoportok megtekintéséhez jelentkezz be Google-fiókkal.';
    list.innerHTML = '';
    return;
  }

  status.textContent = 'Csoportok betöltése…';
  list.innerHTML = '';

  try {
   
console.log('Csoportbetöltés: lekérés indul');

const groupsSnap = await getDocs(collection(db, 'groups'));

console.log('Csoportbetöltés: sikeres', groupsSnap.size, 'csoport');

    const groups = [];

    for (const groupDoc of groupsSnap.docs) {
      const memberRef = doc(
        db, 'groups', groupDoc.id, 'members', currentUser.uid
      );
      
console.log('Tagság ellenőrzése:', groupDoc.id);
      const memberSnap = await getDoc(memberRef);
      console.log('Tagság lekérdezve:', memberSnap.exists());

      if (memberSnap.exists()) {
        groups.push({
          id: groupDoc.id,
          ...groupDoc.data(),
          member: memberSnap.data()
        });
      }
    }

    if (!groups.length) {
      status.textContent =
        'Még nem vagy tagja egyetlen csoportnak sem.';
      return;
    }

    status.textContent = `Csoportjaid: ${groups.length}`;

    list.innerHTML = groups.map(g => `
      <div class="panel" style="padding:20px;margin-bottom:16px">
        <div class="panel-head">
          ${escapeGroupText(g.name || 'Névtelen csoport')}
        </div>

        <p style="color:var(--muted)">
          Szezon: ${escapeGroupText(g.season || 2026)}
          · Szerepkör:
          ${g.member.role === 'admin' ? 'Adminisztrátor' : 'Tag'}
        </p>

        <p>Meghívókód</p>
        <div style="font-size:24px;font-weight:800;letter-spacing:3px;margin:8px 0 14px">
          ${escapeGroupText(g.inviteCode || 'Nincs kód')}
        </div>

        <button class="secondary"
          data-copy-invite="${escapeGroupText(g.inviteCode || '')}">
          Kód másolása
        </button>

        <h3 style="margin-top:24px">Csoporttagok</h3>
        <div data-members="${g.id}">Tagok betöltése…</div>
      </div>
    `).join('');

    list.querySelectorAll('[data-copy-invite]').forEach(button => {
      button.addEventListener('click', async () => {
        const code = button.dataset.copyInvite;

        try {
          await navigator.clipboard.writeText(code);
          toast('Meghívókód másolva: ' + code);
        } catch {
          toast('Meghívókód: ' + code);
        }
      });
    });

    for (const g of groups) {
      const memberList = list.querySelector(
        `[data-members="${g.id}"]`
      );

      try {
        const membersSnap = await getDocs(
          collection(db, 'groups', g.id, 'members')
        );

        const members = membersSnap.docs.map(d => ({
          uid: d.id,
          ...d.data()
        }));

        members.sort((a, b) => {
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (b.role === 'admin' && a.role !== 'admin') return 1;

          return (a.username || '').localeCompare(
            b.username || '', 'hu'
          );
        });

        memberList.innerHTML = members.length
          ? members.map(m => `
              <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,#26313b)">
                <span>${escapeGroupText(m.username || 'Versenyző')}</span>
                <span style="color:var(--muted)">
                  ${m.role === 'admin' ? 'Admin' : 'Tag'}
                </span>
              </div>
            `).join('')
          : 'Még nincs tag a csoportban.';
      } catch (error) {
        console.error('Taglista betöltési hiba:', error);
        memberList.textContent =
          'A taglista nem tölthető be. Ellenőrizd a Firestore Rules szabályokat.';
      }
    }
  } catch (error) {
    console.error('Csoportbetöltési hiba:', error);
    status.textContent =
      'Nem sikerült betölteni a csoportokat. Ellenőrizd a Firestore biztonsági szabályokat.';
  }
}



async function loadTipData() {
  const raceSelect = $('tipRaceSelect');
  const poleSelect = $('tipPoleDriver');
  const winnerSelect = $('tipWinnerDriver');

  if (!raceSelect || !poleSelect || !winnerSelect) {
    console.error('Hiányzó tippjáték mező az index.html fájlban.');
    return;
  }

  raceSelect.innerHTML = '<option value="">Futam kiválasztása...</option>';
  poleSelect.value = '';
  winnerSelect.value = '';

  $('tipRaceInfo').textContent = 'Futamok és pilóták betöltése…';

  try {
    const [scheduleSnap, driversResponse] = await Promise.all([
      getDoc(doc(db, 'raceCalendars', '2026')),
      fetch(`${API_BASE}/2026/drivers/?limit=100`)
    ]);

    if (!scheduleSnap.exists()) throw new Error('A Firestore versenynaptár nem található: raceCalendars/2026.');
    if (!driversResponse.ok) throw new Error('A pilóták API-ja nem adott vissza sikeres választ.');

    const scheduleData = scheduleSnap.data() || {};
    const driversData = await driversResponse.json();

    const races = Array.isArray(scheduleData.events) ? scheduleData.events : [];
    const drivers = driversData.MRData?.DriverTable?.Drivers || [];
    if (!races.length) throw new Error('A Firestore versenynaptára üres.');

    

races.forEach(race => {
  const hasSprint = Boolean(race.Sprint || race.SprintQualifying);
  const baseName = (race.raceName || '').replace(/ Grand Prix$/i, '');

  function addRaceOption(eventType, label, eventId) {
    const option = document.createElement('option');
    option.value = eventId;
    option.textContent = label;

    option.dataset.raceName = label;
    option.dataset.circuitId = race.Circuit?.circuitId || '';
    option.dataset.lat = race.Circuit?.Location?.lat || '';
    option.dataset.lon = race.Circuit?.Location?.long || '';
    option.dataset.raceDate = race.date || '';
    option.dataset.raceTime = race.time || '';
    option.dataset.qualifyingDate = race.Qualifying?.date || '';
    option.dataset.qualifyingTime = race.Qualifying?.time || '';
    option.dataset.sprintQualifyingDate = race.SprintQualifying?.date || '';
    option.dataset.sprintQualifyingTime = race.SprintQualifying?.time || '';
    option.dataset.sprintDate = race.Sprint?.date || '';
    option.dataset.sprintTime = race.Sprint?.time || '';
    option.dataset.eventType = eventType;

    raceSelect.appendChild(option);
  }

  if (hasSprint) {
    addRaceOption(
      'sprint',
      `${baseName} Sprint`,
      `${race.round}-sprint`
    );
  }

  addRaceOption(
    'gp',
    `${baseName} GP`,
    String(race.round)
  );
});



    tipDriverCatalog = drivers;
    const driverOptions = $('tipDriverOptions');
    if (driverOptions) driverOptions.innerHTML = drivers.map(driver => {
      const fullName = `${driver.givenName} ${driver.familyName}`.trim();
      const aliases = [driver.code, driver.familyName, driver.givenName].filter(Boolean);
      return `<option value="${safeText(fullName)}"></option>` + aliases.filter(a => normalizeDriverText(a) !== normalizeDriverText(fullName)).map(a => `<option value="${safeText(a)}"></option>`).join('');
    }).join('');

    // Automatikusan a legközelebbi, még el nem kezdődött esemény legyen kiválasztva.
    // Sprint és GP külön eseményként kezelendő, ezért a saját dátumukat használjuk.
    const now = new Date();
    const futureOptions = Array.from(raceSelect.options)
      .filter(option => option.value)
      .map(option => {
        const date = option.dataset.eventType === 'sprint'
          ? (option.dataset.sprintDate || option.dataset.raceDate)
          : (option.dataset.raceDate || option.dataset.sprintDate);
        const time = option.dataset.eventType === 'sprint'
          ? (option.dataset.sprintTime || '23:59:00Z')
          : (option.dataset.raceTime || '23:59:00Z');
        const dateTime = date ? new Date(`${date}T${time.includes('Z') ? time : time || '23:59:00Z'}`) : null;
        return { option, dateTime };
      })
      .filter(item => item.dateTime && !Number.isNaN(item.dateTime.getTime()) && item.dateTime >= now)
      .sort((a, b) => a.dateTime - b.dateTime);
    if (futureOptions.length) {
      raceSelect.value = futureOptions[0].option.value;
    } else {
      // Ha a szezon összes eseménye elmúlt, maradjon kiválasztás nélkül, ne mutassunk régi futamot következőként.
      raceSelect.value = '';
    }
    $('tipRaceInfo').textContent = futureOptions.length
      ? `Következő esemény automatikusan kiválasztva · ${races.length} futam és ${drivers.length} pilóta betöltve.`
      : `${races.length} futam és ${drivers.length} pilóta betöltve. Nincs hátralévő esemény a betöltött naptárban.`;
    updateTipLocks();
    if (raceSelect.value) {
      showRaceSchedule();
      loadSavedTip();
      loadTipReferenceData();
    }
  } catch (error) {
    console.error('Tippadatok betöltési hiba:', error);
    $('tipRaceInfo').textContent =
      'Nem sikerült betölteni az adatokat. Részletek a Console-ban.';
  }
}


function goTips() {
  if (!currentUser) {
    $('loginOverlay').classList.remove('hidden');
    $('loginStatus').textContent =
      'A tippekhez először jelentkezz be.';
    return;
  }

  showTipsPage();
  loadTipData();
}


['heroTipButton', 'categoryTipButton'].forEach(id => {
  $(id).addEventListener('click', goTips);
});

$('raceDetailsButton').addEventListener('click', () => {
  toast('A versenyhétvége részleteinek bekötése később következik.');
});



function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
function scoreNum(score, key) {
  const aliases = key === 'total' ? ['total','totalPoints','points'] : key === 'bonus' ? ['bonus','bonusPoints'] : key === 'polePoints' ? ['polePoints','polePositionPoints','pole'] : key === 'timePoints' ? ['timePoints','poleTimePoints','time'] : key === 'winnerPoints' ? ['winnerPoints','raceWinnerPoints','winner'] : [key];
  const raw = aliases.map(k => score?.[k]).find(v => v !== undefined && v !== null && v !== '');
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function eventSortValue(score) {
  const m = String(score.raceId || '').match(/^(\d+)/);
  return (m ? Number(m[1]) : 999) * 10 + (score.eventType === 'sprint' ? 0 : 1);
}

let statsSnapshotData = { users: [], scores: [], leaderboard: [], events: [], components: [], officialEvents: null, tipsByEvent: {} };
let statsGroupMode = 'personal';
let statsSelectedGroupId = '';
let statsGroups = [];
let statsGroupMemberUids = null;

async function loadStatsGroups() {
  const select = $('statsGroupSelect');
  const hint = $('statsGroupHint');

  if (!select || !currentUser) return;

  const previousValue = select.value;

  try {
    const groupsSnap = await getDocs(collection(db, 'groups'));
    const groups = [];

    for (const groupDoc of groupsSnap.docs) {
      const memberRef = doc(
        db, 'groups', groupDoc.id, 'members', currentUser.uid
      );
      const memberSnap = await getDoc(memberRef);

      if (memberSnap.exists()) {
        groups.push({
          id: groupDoc.id,
          name: groupDoc.data().name || 'Névtelen csoport'
        });
      }
    }

    statsGroups = groups;
    select.innerHTML = `
      <option value="personal">Saját statisztikám</option>
      <option value="all">Összes csoportom</option>
      ${groups.map(group => `
        <option value="${safeText(group.id)}">${safeText(group.name)}</option>
      `).join('')}
    `;
    select.value = [...select.options].some(option => option.value === previousValue)
      ? previousValue
      : 'personal';

    if (hint) {
      hint.textContent = groups.length
        ? `${groups.length} csoport elérhető.`
        : 'Még nem vagy tagja egyetlen csoportnak sem.';
    }
  } catch (error) {
    console.error('Statisztikai csoportok betöltése sikertelen:', error);
    if (hint) {
      hint.textContent = 'A csoportok betöltése nem sikerült. Ellenőrizd a Firestore Rules jogosultságait.';
    }
  }
}

let statsSelectedMembers = [];

// A régebbi tippek eredetileg csak a saját users/{uid}/tips alatt voltak.
// A csoporttagok privát tippjeit a Firestore Rules helyesen nem engedi másnak olvasni,
// ezért minden játékos a saját korábbi tippjeit másolja át a saját csoportjai tipptárolójába.
// Így a csoport többi tagja a groups/{groupId}/tips alatt olvashatja azokat.
async function syncMyHistoricalTipsToGroups() {
  if (!currentUser || !statsGroups.length) return;

  try {
    const personalTipsSnap = await getDocs(
      collection(db, 'users', currentUser.uid, 'tips')
    );
    if (personalTipsSnap.empty) return;

    for (const group of statsGroups) {
      const memberSnap = await getDoc(
        doc(db, 'groups', group.id, 'members', currentUser.uid)
      );
      if (!memberSnap.exists()) continue;
      const memberData = memberSnap.data() || {};

      for (const tipDoc of personalTipsSnap.docs) {
        const groupTipRef = doc(
          db, 'groups', group.id, 'tips', `${currentUser.uid}_${tipDoc.id}`
        );
        const groupTipSnap = await getDoc(groupTipRef);
        // A már megosztott rekordot nem írjuk felül; a saveTips kezeli a frissítést.
        if (groupTipSnap.exists()) continue;

        await setDoc(groupTipRef, {
          ...(tipDoc.data() || {}),
          uid: currentUser.uid,
          username: memberData.username || memberData.displayName || currentUser.displayName || 'Versenyző',
          groupId: group.id
        });
      }
    }
  } catch (error) {
    // A szinkronizálás hibája ne állítsa le a saját statisztika betöltését.
    console.warn('A régi tippek csoportos megosztása nem teljes:', error.message);
  }
}

async function applyStatsGroupSelection() {
  const select = $('statsGroupSelect');
  const selected = select?.value || 'personal';

  statsSelectedMembers = [];

  if (!currentUser) {
    statsGroupMode = 'all';
    statsSelectedGroupId = '';
    statsGroupMemberUids = null;
    return;
  }

  if (selected === 'personal') {
    statsGroupMode = 'personal';
    statsSelectedGroupId = '';
    statsGroupMemberUids = new Set([currentUser.uid]);

    let profile = {};
    try {
      const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (profileSnap.exists()) profile = profileSnap.data() || {};
    } catch (error) {
      console.warn('A saját profiladatok nem tölthetők be a statisztikához:', error.message);
    }

    statsSelectedMembers = [{
      ...profile,
      uid: currentUser.uid,
      username: profile.username || profile.displayName || currentUser.displayName || 'Saját profil',
      team: profile.team || 'ferrari'
    }];
    return;
  }

  const selectedGroups = selected === 'all'
    ? statsGroups
    : statsGroups.filter(group => group.id === selected);

  statsGroupMode = selected === 'all' ? 'all' : 'group';
  statsSelectedGroupId = selected === 'all' ? '' : selected;

  const membersByUid = new Map();
  for (const group of selectedGroups) {
    const membersSnap = await getDocs(collection(db, 'groups', group.id, 'members'));
    membersSnap.forEach(memberDoc => {
      const memberData = memberDoc.data() || {};
      const uid = memberData.uid || memberDoc.id;
      if (!uid) return;
      const previous = membersByUid.get(uid) || {};
      membersByUid.set(uid, {
        ...previous,
        ...memberData,
        uid,
        username: memberData.username || memberData.displayName || previous.username || 'Versenyző',
        team: memberData.team || previous.team || 'ferrari'
      });
    });
  }

  statsSelectedMembers = [...membersByUid.values()];
  statsGroupMemberUids = new Set(statsSelectedMembers.map(member => member.uid));
}

$('statsGroupSelect')?.addEventListener('change', async () => {
  try {
    const select = $('statsGroupSelect');
    if (select) select.disabled = true;
    if ($('statsStatus')) $('statsStatus').textContent = 'A kiválasztott nézet adatainak betöltése…';
    await loadScoreboard();
  } catch (error) {
    console.error('A csoportnézet frissítése sikertelen:', error);
    toast('Nem sikerült betölteni a csoport statisztikáit.');
  } finally {
    const select = $('statsGroupSelect');
    if (select) select.disabled = false;
  }
});

let officialStatsPromise = null;
const officialDriverName = d => d ? `${d.givenName || ''} ${d.familyName || ''}`.trim() : '—';
async function loadOfficialStatsData() {
  if (officialStatsPromise) return officialStatsPromise;
  officialStatsPromise = (async () => {
    const season = 2026;
    // A hivatalos eredményeket a GitHub Actions szinkronizálja a Firestore-ba.
    // A kliens nem hívja közvetlenül a Jolpica API-t statisztikamegnyitáskor.
    const scheduleSnap = await getDoc(doc(db, 'officialSchedule', String(season)));
    if (!scheduleSnap.exists()) {
      throw new Error('A hivatalos versenynaptár még nincs eltárolva. Futtasd a GitHub Actions „Sync F1 official results” workflow-t.');
    }
    const scheduleData = scheduleSnap.data() || {};
    const schedule = Array.isArray(scheduleData.events) ? scheduleData.events : [];
    const officialEvents = [];
    for (const item of schedule) {
      const resultSnap = await getDoc(doc(db, 'officialResults', String(item.key)));
      const saved = resultSnap.exists() ? (resultSnap.data() || {}) : {};
      const qualifying = Array.isArray(saved.qualifying) ? saved.qualifying : [];
      const results = Array.isArray(saved.results) ? saved.results : [];
      const q1 = qualifying.find(x => Number(x.position) === 1) || null;
      const win = results.find(x => Number(x.position) === 1) || null;
      const event = {
        ...item,
        qualifying,
        results,
        poleDriver: q1 ? officialDriverName(q1.Driver) : '',
        poleDriverId: q1?.Driver?.driverId || '',
        poleCode: q1?.Driver?.code || '',
        poleTime: q1?.Q3 || q1?.SQ3 || q1?.Q2 || q1?.SQ2 || q1?.Q1 || q1?.SQ1 || '',
        winner: win ? officialDriverName(win.Driver) : '',
        winnerDriverId: win?.Driver?.driverId || '',
        winnerCode: win?.Driver?.code || '',
        driverNames: Object.fromEntries([...qualifying, ...results].filter(x => x.Driver?.driverId).map(x => [x.Driver.driverId, officialDriverName(x.Driver)])),
        apiError: saved.lastError || ''
      };
      officialEvents.push(event);
    }
       const tipsByEvent = {};
    const selected = $('statsGroupSelect')?.value || 'personal';

    function addTip(tip, docId, fallbackUid = '') {
      const uid = tip.uid || fallbackUid;
      if (!uid) return;

      const eventId = String(tip.raceId || docId || '');
      if (!eventId) return;

      const user = statsSnapshotData.users.find(u => u.uid === uid);

      const entry = {
        ...tip,
        uid,
        name: tip.username || user?.username ||
          user?.displayName || user?.name || 'Játékos',
        _tipDocId: docId
      };

      if (!tipsByEvent[eventId]) tipsByEvent[eventId] = [];

      const alreadyAdded = tipsByEvent[eventId].some(
        existing => existing.uid === uid &&
          String(existing.raceId || existing._tipDocId) ===
          String(entry.raceId || entry._tipDocId)
      );

      if (!alreadyAdded) {
        tipsByEvent[eventId].push(entry);
      }
    }

    if (selected === 'personal') {
      if (currentUser) {
        const snap = await getDocs(
          collection(db, 'users', currentUser.uid, 'tips')
        );

        snap.forEach(d => addTip(d.data() || {}, d.id, currentUser.uid));
      }
    } else {
      const selectedGroups = selected === 'all'
        ? statsGroups
        : statsGroups.filter(group => group.id === selected);

      for (const group of selectedGroups) {
        const tipsSnap = await getDocs(
          collection(db, 'groups', group.id, 'tips')
        );

        tipsSnap.forEach(d => addTip(d.data() || {}, d.id));
      }
    }
    return { officialEvents, tipsByEvent };
  })().catch(error => { officialStatsPromise = null; throw error; });
  return officialStatsPromise;
}
let activeStatsTab = 'overview';
const statsEsc = value => safeText(String(value ?? '—'));
function renderStatsDetail() {
  const root = $('statsDetailView'); if (!root) return;
  const base = statsSnapshotData;

const filteredUsers = statsGroupMemberUids
  ? base.users.filter(u => statsGroupMemberUids.has(u.uid))
  : base.users;

const filteredScores = statsGroupMemberUids
  ? base.scores.filter(s => statsGroupMemberUids.has(s.uid))
  : base.scores;

const filteredTotals = new Map(
  filteredUsers.map(u => [u.uid, {
    uid: u.uid,
    name: u.username || u.displayName || u.name || 'Versenyző',
    gp: 0,
    sprint: 0,
    total: 0,
    events: 0,
    pole: 0,
    time: 0,
    winner: 0,
    bonus: 0
  }])
);

filteredScores.forEach(s => {
  const row = filteredTotals.get(s.uid);
  if (!row) return;

  const pts = scoreNum(s, 'total');
  row.total += pts;

  if (s.eventType === 'sprint' ||
      String(s.raceId || '').endsWith('-sprint')) {
    row.sprint += pts;
  } else {
    row.gp += pts;
  }

  row.events++;
  row.pole += scoreNum(s, 'polePoints');
  row.time += scoreNum(s, 'timePoints');
  row.winner += scoreNum(s, 'winnerPoints');
  row.bonus += scoreNum(s, 'bonus');
});

const users = filteredUsers;
const scores = filteredScores;

const leaderboard = [...filteredTotals.values()].sort(
  (a, b) =>
    b.total - a.total ||
    b.gp - a.gp ||
    a.name.localeCompare(b.name, 'hu')
);

const eventsMap = new Map();

scores.forEach(s => {
  const id = String(s.raceId || s.scoreId);

  if (!eventsMap.has(id)) {
    eventsMap.set(id, {
      id,
      name: s.raceName || `Futam ${id}`,
      points: 0,
      sprint: s.eventType === 'sprint' || id.endsWith('-sprint'),
      scores: []
    });
  }

  const item = eventsMap.get(id);
  item.points += scoreNum(s, 'total');
  item.scores.push(s);
});

const events = [...eventsMap.values()].sort(
  (a, b) =>
    eventSortValue({
      raceId: a.id,
      eventType: a.sprint ? 'sprint' : 'gp'
    }) -
    eventSortValue({
      raceId: b.id,
      eventType: b.sprint ? 'sprint' : 'gp'
    })
);

const components = [
  {
    label: 'Pole pozíció',
    color: 'red',
    points: scores.reduce((n, s) => n + scoreNum(s, 'polePoints'), 0)
  },
  {
    label: 'Időtipp',
    color: 'blue',
    points: scores.reduce((n, s) => n + scoreNum(s, 'timePoints'), 0)
  },
  {
    label: 'Futamgyőztes',
    color: 'gold',
    points: scores.reduce((n, s) => n + scoreNum(s, 'winnerPoints'), 0)
  },
  {
    label: 'Bónuszpontok',
    color: 'green',
    points: scores.reduce((n, s) => n + scoreNum(s, 'bonus'), 0)
  }
];
  const points = s => scoreNum(s,'total');
  const fmt = n => Number(n||0).toLocaleString('hu-HU',{maximumFractionDigits:1});
  const playerTotals = leaderboard;
  const head = (title,desc='Az adatok a jelenleg betöltött Firestore-pontrekordokból származnak.') => `<h2>${title}</h2><p>${desc}</p>`;
  const table = (headers, rows) => `<div style="overflow-x:auto"><table class="stats-data-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}">Ehhez a nézethez még nincs elegendő adat.</td></tr>`}</tbody></table></div>`;
  root.classList.remove('hidden');
  if(activeStatsTab==='overview'){root.classList.add('hidden');return;}
  if(activeStatsTab==='events'){
    root.innerHTML = head('Futamonkénti eredmények','Hivatalos időmérő- és futameredmények, a játékosok mentett tippjei és a Firestore-ban tárolt pontok.') + '<div class="stats-events-toolbar"><label>Szezon <select id="statsEventSeason" class="stats-control"><option value="2026" selected>2026</option></select></label><label>Típus <select id="statsEventType" class="stats-control"><option value="all">Összes esemény</option><option value="gp">Nagydíj</option><option value="sprint">Sprint</option></select></label><span id="statsOfficialStatus" role="status">Hivatalos eredmények betöltése…</span></div><div id="statsOfficialEvents" class="stats-official-events"><p class="stats-empty">Eseményadatok betöltése…</p></div>';
    loadOfficialStatsData().then(({officialEvents,tipsByEvent})=>{
      if(!document.getElementById('statsOfficialEvents') || activeStatsTab!=='events') return;
      statsSnapshotData.officialEvents=officialEvents; statsSnapshotData.tipsByEvent=tipsByEvent;
      const status=$('statsOfficialStatus'); if(status) { const tipCount=Object.values(tipsByEvent).reduce((n,a)=>n+a.length,0); const failed=officialEvents.filter(e=>!e.poleDriver&&!e.winner).length; status.textContent=`Hivatalos F1-adatok: Firestore${failed?` · ${failed} esemény eredménye még nem érhető el`:''} · Betöltött tipprekordok: ${tipCount}${tipCount?'':' · más játékosok tippjeihez ellenőrizd a Firestore Rules jogosultságait'}`; }
      const renderEvents=()=>{
        const target=$('statsOfficialEvents'); if(!target)return;
        const type=$('statsEventType')?.value||'all';
        const filtered=officialEvents.filter(ev=>type==='all'||(type==='sprint'?ev.sprint:!ev.sprint));
        target.innerHTML=filtered.map((ev,index)=>{
          const tipKey=ev.key; const tips=Object.values(tipsByEvent).flat();
          const eventScores=scores.filter(s=>String(s.raceId||s.scoreId)===tipKey || (ev.sprint && String(s.raceId||s.scoreId).endsWith('-sprint') && Number.parseInt(s.raceId||s.scoreId,10)===ev.round) || (!ev.sprint && String(s.raceId||s.scoreId)===String(ev.round)));
          const scoreFor=(uid,key)=>{const rec=eventScores.find(s=>s.uid===uid);if(!rec)return null;const aliases={pole:['polePoints','polePositionPoints','pole'],time:['timePoints','poleTimePoints','time'],winner:['winnerPoints','raceWinnerPoints','winner']};for(const f of aliases[key])if(rec[f]!==undefined&&rec[f]!==null)return Number(rec[f])||0;return null;};
          const totalFor=uid=>{const rec=eventScores.find(s=>s.uid===uid);return rec?scoreNum(rec,'total'):null;};
          const esc=statsEsc;
          // Ugyanaz a játékos több forrásból is megjelenhet (fallback + publikus roster).
          // UID szerint egy sor marad; a tippekhez a dokumentumazonosító és raceId is egyezhet.
          const normalizedEventKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const eventAliases = new Set([normalizedEventKey(ev.key), normalizedEventKey(String(ev.round)), normalizedEventKey(`${ev.round}${ev.sprint?'-sprint':''}`), normalizedEventKey(ev.raceName), normalizedEventKey(`${ev.raceName}${ev.sprint?' sprint':''}`)]);
          const eventTips = tips.filter(t => {
            const keys = [t.raceId, t._tipDocId, t.eventId, t.raceName].map(normalizedEventKey).filter(Boolean);
            // Elsődlegesen pontos eseményazonosítóval egyeztetünk.
            if (keys.some(k => eventAliases.has(k))) return true;

            // Régebbi tippekben a dokumentumazonosító/raceId eltérhet az API
            // fordulóazonosítójától. Ilyenkor a mentett futamnév és az eseménytípus
            // alapján is egyeztetünk, ékezetek és írásjelek nélkül.
            const tipName = normalizedEventKey(t.raceName || '');
            const raceName = normalizedEventKey(ev.raceName || '');
            const tipLooksSprint = String(t.eventType || '').toLowerCase() === 'sprint' ||
              keys.some(k => k.includes('sprint')) || tipName.includes('sprint');
            const sameType = Boolean(t.eventType)
              ? (String(t.eventType).toLowerCase() === 'sprint') === Boolean(ev.sprint)
              : tipLooksSprint === Boolean(ev.sprint);
            if (tipName && raceName && sameType &&
                (tipName.includes(raceName) || raceName.includes(tipName))) return true;

            // Végső kompatibilitás: az azonos fordulószámú régi numerikus ID-k.
            const numericId = keys.find(k => /^\d+$/.test(k));
            return Boolean(numericId && Number(numericId) === Number(ev.round) && sameType);
          });
          const canonicalByName = new Map();
          const playerNameKey = p => String(p.name || p.username || p.displayName || '').trim().toLocaleLowerCase('hu').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
          for (const p of playerTotals) {
            const key = playerNameKey(p) || p.uid;
            const existing = canonicalByName.get(key);
            const hasTip = candidate => tips.some(t => t.uid === candidate.uid && [t.raceId,t._tipDocId,t.eventId,t.raceName].some(v => [ev.key,String(ev.round),`${ev.round}-sprint`,ev.raceName,`${ev.raceName} sprint`].some(k => normalizedEventKey(v) === normalizedEventKey(k))));
            const hasScore = candidate => eventScores.some(score => score.uid === candidate.uid);
            if (!existing || (hasTip(p) && !hasTip(existing)) || (hasTip(p) === hasTip(existing) && hasScore(p) && !hasScore(existing))) canonicalByName.set(key,p);
          }
          const canonicalPlayers = [...canonicalByName.values()];
          const tipFor = player => eventTips.find(t => t.uid === player.uid) || eventTips.find(t => String(t.name||'').trim().toLocaleLowerCase('hu') === String(player.name||'').trim().toLocaleLowerCase('hu')) || null;
          const timeToMs = value => { const m=String(value||'').trim().match(/^(?:(\d+):)?(\d{1,2})\.(\d{3})$/); return m ? ((Number(m[1]||0)*60+Number(m[2]))*1000+Number(m[3])) : null; };
          const deltaLabel = (guess, official) => { const a=timeToMs(guess), b=timeToMs(official); if(a===null||b===null)return ''; const diff=a-b; if(diff===0)return 'Pontos idő'; const seconds=(Math.abs(diff)/1000).toFixed(3); return `${diff>0?'+':'−'}${seconds} mp eltérés`; };
          const detailRows=canonicalPlayers.map(player=>{
            const tip=tipFor(player);
            const tipPole=tip?.poleDriver||''; const tipTime=tip?.poleTime||''; const tipWinner=tip?.winnerDriver||'';
            const driverLabel=id=>id?(ev.driverNames?.[id]||id):'';
            const closestTimeUid = (() => { if(!ev.poleTime) return null; const candidates=canonicalPlayers.map(p=>({uid:p.uid,ms:timeToMs(tipFor(p)?.poleTime)})).filter(p=>p.ms!==null); if(!candidates.length) return null; const officialMs=timeToMs(ev.poleTime); if(officialMs===null) return null; candidates.sort((a,b)=>Math.abs(a.ms-officialMs)-Math.abs(b.ms-officialMs)); return candidates[0].uid; })();
            const resultMark=(kind,guess,official,player)=>{if(!guess)return '<span class="stats-result-pill muted">Nincs tipp</span>';if(!official)return '<span class="stats-result-pill muted">Eredményre vár</span>';if(kind==='time'){const guessMs=timeToMs(guess),officialMs=timeToMs(official);if(guessMs===null||officialMs===null)return '<span class="stats-result-pill wrong">× Érvénytelen idő</span>';const closest=player&&player.uid===closestTimeUid;return `<span class="stats-result-pill ${closest?'correct':'wrong'}">${closest?'✓':'×'} ${closest?'Legközelebb':'Nem talált'}</span>`;}const correct=String(guess).toLowerCase()===String(official).toLowerCase();return `<span class="stats-result-pill ${correct?'correct':'wrong'}">${correct?'✓':'×'} ${correct?'Talált':'Nem talált'}</span>`;};
            const score=eventScores.find(s=>s.uid===player.uid) || null;
            const storedTotal=score?scoreNum(score,'total'):null;
            const polePoints=scoreFor(player.uid,'pole'),timePoints=scoreFor(player.uid,'time'),winnerPoints=scoreFor(player.uid,'winner');
            const shownTip=value=>value?esc(value):'<span class="stats-muted">—</span>';
            const poleOfficial=ev.poleDriver ? `${esc(ev.poleDriver)}` : 'Eredményre vár';
            const isClosestTime=Boolean(tipTime&&closestTimeUid===player.uid);
            const timeDelta=tipTime&&ev.poleTime?`<small class="stats-time-delta ${isClosestTime?'correct':'wrong'}">${esc(deltaLabel(tipTime,ev.poleTime))}</small>`:'';
            return `<tr><td><strong>${esc(player.name)}</strong></td><td>${shownTip(driverLabel(tipPole))}<small class="stats-cell-status">${resultMark('driver',tipPole,ev.poleDriverId)}</small></td><td>${shownTip(tipTime)}${timeDelta}<small class="stats-cell-status">${resultMark('time',tipTime,ev.poleTime,player)}</small></td><td>${shownTip(driverLabel(tipWinner))}<small class="stats-cell-status">${resultMark('driver',tipWinner,ev.winnerDriverId)}</small></td><td class="stats-total-cell">${storedTotal===null?'—':fmt(storedTotal)}<small class="stats-cell-points">${polePoints===null&&timePoints===null&&winnerPoints===null?'Pontbontás nem elérhető':`Pole ${polePoints===null?'—':fmt(polePoints)} · Idő ${timePoints===null?'—':fmt(timePoints)} · Győztes ${winnerPoints===null?'—':fmt(winnerPoints)}`}</small></td></tr>`;
          }).join('');
          const eventId=`stats-official-${String(ev.key).replace(/[^a-z0-9-]/gi,'-')}`;
          const formatDate=ev.date?new Date(`${ev.date}T12:00:00`).toLocaleDateString('hu-HU',{year:'numeric',month:'short',day:'numeric'}):'Dátum nincs';
          const summaryPole=ev.poleDriver?`${esc(ev.poleDriver)}${ev.poleTime?' · '+esc(ev.poleTime):''}`:'Még nincs hivatalos időmérőeredmény';
          const summaryWinner=ev.winner?esc(ev.winner):'Még nincs hivatalos futameredmény';
          const avg=eventScores.length?(eventScores.reduce((n,s)=>n+scoreNum(s,'total'),0)/eventScores.length).toLocaleString('hu-HU',{maximumFractionDigits:1}):'—';
          const max=eventScores.length?Math.max(...eventScores.map(s=>scoreNum(s,'total'))):'—';
          return `<article class="stats-official-event"><button type="button" class="stats-official-summary" data-official-event="${eventId}" aria-expanded="false"><span class="stats-official-round">${ev.round}${ev.sprint?'S':''}</span><span class="stats-official-name"><strong>${esc(ev.raceName)}${ev.sprint?' – Sprint':''}</strong><small>${esc(ev.circuitName||ev.race?.Circuit?.circuitName||'')} · ${formatDate}</small></span><span class="stats-official-type ${ev.sprint?'sprint':''}">${ev.sprint?'Sprint':'Nagydíj'}</span><span class="stats-official-fact"><small>Pole</small><strong>${summaryPole}</strong></span><span class="stats-official-fact"><small>Győztes</small><strong>${summaryWinner}</strong></span><span class="stats-official-fact stats-event-kpi"><small>Mezőnyátlag</small><strong>${avg}</strong></span><span class="stats-official-fact stats-event-kpi"><small>Max. pont</small><strong>${max}</strong></span><span class="stats-official-chevron" aria-hidden="true">⌄</span></button><div id="${eventId}" class="stats-official-detail hidden"><div class="stats-official-result-cards"><div><small>Hivatalos pole-idő</small><strong>${ev.poleTime?esc(ev.poleTime):'Még nincs hivatalos idő'}</strong></div><div><small>Hivatalos pole</small><strong>${ev.poleDriver?esc(ev.poleDriver):'Még nincs hivatalos időmérőeredmény'}</strong></div><div><small>Futamgyőztes</small><strong>${ev.winner?esc(ev.winner):'Még nincs hivatalos futameredmény'}</strong></div></div><div class="stats-official-table-wrap"><table class="stats-data-table stats-prediction-table"><thead><tr><th>Játékos</th><th>Pole tipp</th><th>Pole-idő tipp</th><th>Futamgyőztes tipp</th><th>Összes pont</th></tr></thead><tbody>${detailRows||'<tr><td colspan="5">Nincs elérhető játékosadat.</td></tr>'}</tbody></table></div><p class="stats-scoring-note">A hivatalos F1-eredményeket a Firestore-ban tároljuk. A pontokat a meglévő Firestore-rekordokból olvassuk; a hiányzó pontokat nem becsüljük meg.</p></div></article>`;
        }).join('')||'<p class="stats-empty">Nincs esemény ehhez a szűréshez.</p>';
        target.querySelectorAll('[data-official-event]').forEach(button=>button.addEventListener('click',()=>{const panel=document.getElementById(button.dataset.officialEvent);if(!panel)return;const opening=panel.classList.contains('hidden');panel.classList.toggle('hidden',!opening);button.classList.toggle('expanded',opening);button.setAttribute('aria-expanded',String(opening));}));
      };
      $('statsEventType')?.addEventListener('change',renderEvents);renderEvents();
    }).catch(error=>{const target=$('statsOfficialEvents');if(target)target.innerHTML=`<p class="stats-empty">A hivatalos F1-adatok most nem tölthetők be. ${statsEsc(error.message)}</p>`;const status=$('statsOfficialStatus');if(status)status.textContent='Adatbetöltési hiba';console.error('Hivatalos futameredmények:',error);});
  } else if(activeStatsTab==='categories'){
    const total=Math.max(1,scores.reduce((n,s)=>n+points(s),0));
    root.innerHTML=head('Kategóriák és pontforrások','Csak a pontdokumentumokban ténylegesen tárolt kategóriapontok jelennek meg. A hiányzó mezőket nem tekintjük találatnak.')+`<div class="stats-category-list">${components.map(c=>`<div><div class="stats-category-label"><span>${statsEsc(c.label)}</span><b>${fmt(c.points)} pont · ${Math.round(c.points/total*100)}%</b></div><div class="stats-category-track"><i class="tone-${c.color}" style="width:${Math.min(100,c.points/total*100)}%"></i></div></div>`).join('')}</div>`+table(['Játékos','Pole pont','Időtipp pont','Győztes pont','Bónusz','Összesen'],playerTotals.map(p=>`<tr><td>${statsEsc(p.name)}</td><td>${fmt(p.pole)}</td><td>${fmt(p.time)}</td><td>${fmt(p.winner)}</td><td>${fmt(p.bonus)}</td><td><b>${fmt(p.total)}</b></td></tr>`));
  } else if(activeStatsTab==='players'){
    root.innerHTML=head('Játékosok teljesítménye','Rangsor összpontszám alapján. Az átlag a játékoshoz tartozó pontrekordok számával osztva értendő.')+table(['Hely','Játékos','Összpont','Rekordok','Átlag','Nagydíj','Sprint'],playerTotals.map((p,i)=>`<tr><td>${i+1}</td><td>${statsEsc(p.name)}</td><td><b>${fmt(p.total)}</b></td><td>${p.events}</td><td>${fmt(p.events?p.total/p.events:0)}</td><td>${fmt(p.gp)}</td><td>${fmt(p.sprint)}</td></tr>`));
  } else if(activeStatsTab==='compare'){
    const opts=playerTotals.map(p=>`<option value="${statsEsc(p.uid)}">${statsEsc(p.name)}</option>`).join('');
    root.innerHTML=head('Játékos-összehasonlítás','Válassz két játékost. Az összevetés az azonos adatforrásból számolt pontokra épül.')+`<label>Első játékos <select class="stats-control" id="statsCompareA">${opts}</select></label><label>Második játékos <select class="stats-control" id="statsCompareB">${opts}</select></label><div id="statsCompareResults"></div>`;
    const update=()=>{const a=playerTotals.find(p=>p.uid===$('statsCompareA')?.value)||playerTotals[0], b=playerTotals.find(p=>p.uid===$('statsCompareB')?.value)||playerTotals[1]||playerTotals[0];const target=$('statsCompareResults');if(!target||!a||!b){if(target)target.innerHTML='<p>Nincs összehasonlítható játékosadat.</p>';return;}target.innerHTML=`<div class="stats-compare-grid"><div class="stats-compare-card"><strong>${statsEsc(a.name)}</strong><div>Összpontszám: <b>${fmt(a.total)}</b></div><div>Átlag / rekord: <b>${fmt(a.events?a.total/a.events:0)}</b></div><div>Nagydíj: ${fmt(a.gp)} · Sprint: ${fmt(a.sprint)}</div></div><div class="stats-compare-card"><strong>${statsEsc(b.name)}</strong><div>Összpontszám: <b>${fmt(b.total)}</b></div><div>Átlag / rekord: <b>${fmt(b.events?b.total/b.events:0)}</b></div><div>Nagydíj: ${fmt(b.gp)} · Sprint: ${fmt(b.sprint)}</div></div></div><p>Pontkülönbség: <b>${fmt(Math.abs(a.total-b.total))}</b> · ${a.total===b.total?'Döntetlen':a.total>b.total?statsEsc(a.name)+' vezet':statsEsc(b.name)+' vezet'}</p>`;};
    $('statsCompareA')?.addEventListener('change',update);$('statsCompareB')?.addEventListener('change',update);update();
  }
}
document.addEventListener('click', event=>{const button=event.target.closest('#statsSectionTabs [data-stats-tab]');if(!button)return;event.preventDefault();activeStatsTab=button.dataset.statsTab;document.querySelectorAll('#statsSectionTabs [data-stats-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});renderStatsDetail();});

async function loadScoreboard() {
  const rankingStatus = $('rankingStatus');
  const statsStatus = $('statsStatus');
  if (rankingStatus) rankingStatus.textContent = 'Pontok betöltése a Firestore-ból…';
  if (statsStatus) statsStatus.textContent = 'Statisztikák betöltése a Firestore-ból…';
  try {
        if (currentUser) {
      await loadStatsGroups();
      await syncMyHistoricalTipsToGroups();
      await applyStatsGroupSelection();
    } else {
      statsGroupMemberUids = null;
    }
    officialStatsPromise = null;
    // Tesztprojekt: ne olvassuk le a teljes /users gyűjteményt,
    // mert az privát profiladatokat tartalmaz. A tesztfelhasználók UID-jeit
    // explicit listából használjuk, és csak a scores alkollekciót kérjük le.
    const fallbackUsers = [
      { uid: 'A0c1CfsPutPLAoNSaiTStBFTFvs1', username: 'Geri', team: 'mercedes' },
      { uid: '3ZzPzpz5cOdpc61eAvTVax2zvQz2', username: 'Nándi', team: 'williams' },
      { uid: 'LadIkNLT9mdEo9d09mg2LWLcemf1', username: 'Áron', team: 'redbull' }
    ];
    // A nyilvános ranglista-gyűjteményből dinamikusan felvesszük az új játékosokat.
    // A teljes /users gyűjteményt szándékosan nem olvassuk, mert privát profiladatokat tartalmaz.
    // A nyilvános roster bővíti az ismert listát; nem írhatja felül a fallback játékosokat.
    // A teljes /users gyűjteményt továbbra sem olvassuk, mert privát profiladatokat tartalmaz.
    const userMap = new Map(fallbackUsers.map(u => [u.uid, {...u}]));
    try {
      const publicPlayers = await getDocs(collection(db, 'leaderboard'));
      publicPlayers.docs.forEach(d => {
        const data = d.data() || {};
        const prior = userMap.get(d.id) || {};
        userMap.set(d.id, { ...prior, ...data, uid: d.id,
          username: data.username || data.displayName || data.name || prior.username || 'Versenyző' });
      });
    } catch (publicRosterError) {
      console.info('A publikus játékoslista nem olvasható; az engedélyezett ismert játékoslista használata.', publicRosterError.message);
    }
    const users = [...userMap.values()].map(u => ({...u, username:u.username || u.displayName || u.name || 'Versenyző'}));
    const scoreResults = await Promise.all(users.map(async user => {
      const snap = await getDocs(collection(db, 'users', user.uid, 'scores'));
      return snap.docs.map(d => ({ uid: user.uid, scoreId: d.id, ...d.data() }));
    }));
    const scores = scoreResults.flat().filter(s => Number(s.year ?? s.season ?? 2026) === 2026).map(s => ({...s, total:scoreNum(s,'total'), name: users.find(u=>u.uid===s.uid)?.username || 'Versenyző'}));
    // A globális ranglista és a statisztikai nézet külön adatforrást kap.
    // Így a ranglista megmarad, a statisztika viszont kizárólag a kiválasztott
    // személy vagy csoport(ok) tagjait mutatja, a publikus roster meglététől függetlenül.
    const statsUsers = currentUser
      ? statsSelectedMembers.map(member => {
          const known = userMap.get(member.uid) || {};
          return {
            ...known,
            ...member,
            uid: member.uid,
            username: member.username || member.displayName || known.username || known.displayName || 'Versenyző',
            team: member.team || known.team || 'ferrari'
          };
        })
      : users;
    const globalUidSet = new Set(users.map(user => user.uid));
    const statsScoreResults = await Promise.all(statsUsers.map(async user => {
      if (globalUidSet.has(user.uid)) {
        return scores.filter(score => score.uid === user.uid);
      }
      const snap = await getDocs(collection(db, 'users', user.uid, 'scores'));
      return snap.docs
        .map(d => ({ uid: user.uid, scoreId: d.id, ...d.data() }))
        .filter(score => Number(score.year ?? score.season ?? 2026) === 2026)
        .map(score => ({
          ...score,
          total: scoreNum(score, 'total'),
          name: user.username || user.displayName || user.name || 'Versenyző'
        }));
    }));
    const statsScores = statsScoreResults.flat().map(score => ({
      ...score,
      name: statsUsers.find(user => user.uid === score.uid)?.username || score.name || 'Versenyző'
    }));
    const nameByUid = new Map(users.map(u => [
      u.uid, u.username || u.displayName || u.name || 'Versenyző'
    ]));
    const totals = new Map(users.map(u => [u.uid, {
      uid: u.uid, name: nameByUid.get(u.uid), gp: 0, sprint: 0, total: 0, events: 0,
      pole: 0, time: 0, winner: 0, bonus: 0
    }]));
    scores.forEach(s => {
      const row = totals.get(s.uid);
      if (!row) return;
      const pts = scoreNum(s, 'total');
      row.total += pts;
      if (s.eventType === 'sprint' || String(s.raceId || '').endsWith('-sprint')) row.sprint += pts;
      else row.gp += pts;
      row.events++;
      row.pole += scoreNum(s, 'polePoints');
      row.time += scoreNum(s, 'timePoints');
      row.winner += scoreNum(s, 'winnerPoints');
      row.bonus += scoreNum(s, 'bonus');
    });
    const leaderboard = [...totals.values()].sort((x, y) => y.total - x.total || y.gp - x.gp || x.name.localeCompare(y.name, 'hu'));
    if (rankingStatus) rankingStatus.textContent = scores.length
      ? `${users.length} játékos · ${scores.length} pontozott esemény · 2026-os szezon`
      : 'Még nincsenek pontdokumentumok, vagy nincs hozzájuk olvasási jogosultság.';
    if ($('rankingCards')) {
      $('rankingCards').innerHTML = leaderboard.map((p, i) => `
        <article class="rank-card team-card team-${safeText(p.team || 'ferrari')} ${i === 0 ? 'rank-first' : ''}">
          <div class="team-card-glow" aria-hidden="true"></div><div class="rank-position">${i + 1}.</div>
          <div class="rank-name">${safeText(p.name)}</div>
          <div class="rank-total">${p.total} <small>pont</small></div>
          <div class="rank-split"><span>Nagydíj <b>${p.gp}</b></span><span>Sprint <b>${p.sprint}</b></span></div>
        </article>`).join('');
    }
    const sortedScores = [...scores].sort((x, y) => eventSortValue(x) - eventSortValue(y) || nameByUid.get(x.uid).localeCompare(nameByUid.get(y.uid), 'hu'));
    // Alapnézetben eseményenként csak egy sor látszik; a részletes játékos-pontozás lenyitható.
    const eventGroups = new Map();
    sortedScores.forEach(s => {
      const id = String(s.raceId || s.scoreId);
      if (!eventGroups.has(id)) eventGroups.set(id, { id, name: s.raceName || ('Futam ' + id), sprint: s.eventType === 'sprint' || id.endsWith('-sprint'), scores: [] });
      eventGroups.get(id).scores.push(s);
    });
    const players = [...users].sort((a, b) => a.username.localeCompare(b.username, 'hu'));
    const eventFlag = name => { const n=String(name).toLowerCase(); const flags=[['australian','au'],['chinese','cn'],['japanese','jp'],['bahrain','bh'],['saudi','sa'],['miami','us'],['canadian','ca'],['monaco','mc'],['spanish','es'],['barcelona','es'],['austrian','at'],['british','gb'],['belgian','be'],['hungarian','hu'],['dutch','nl'],['italian','it'],['azerbaijan','az'],['singapore','sg'],['united states','us'],['mexico','mx'],['brazil','br'],['las vegas','us'],['qatar','qa'],['abu dhabi','ae'],['portuguese','pt'],['french','fr'],['german','de']];const code=(flags.find(([key])=>n.includes(key))||[])[1]||'un';return `<img class="flag-img" src="https://flagcdn.com/w40/${code}.png" alt="${code.toUpperCase()} zászló" loading="lazy" onerror="this.outerHTML='🏁'">`; };
    if ($('eventScoresBody')) {
      $('eventScoresBody').innerHTML = eventGroups.size ? [...eventGroups.values()].map((event, index) => {
        const eventTotal = uid => event.scores.filter(s => s.uid === uid).reduce((sum, s) => sum + scoreNum(s, 'total'), 0);
        const details = [...event.scores].sort((a, b) => nameByUid.get(a.uid).localeCompare(nameByUid.get(b.uid), 'hu')).map(s => `
          <tr><td>${safeText(nameByUid.get(s.uid))}</td><td>${scoreNum(s, 'polePoints')}</td><td>${scoreNum(s, 'timePoints')}</td><td>${scoreNum(s, 'winnerPoints')}</td><td>${scoreNum(s, 'bonus')}</td><td><b>${scoreNum(s, 'total')}</b></td></tr>`).join('');
        return `<tr class="event-summary-row"><td class="event-number">${index + 1}</td><td class="event-name-cell"><span class="event-flag">${eventFlag(event.name)}</span><span>${safeText(event.name.replace(/^\d+\s*[|–-]?\s*/, '').replace(/\s*[–-]\s*Sprint$/i, ''))}</span></td><td><span class="event-type ${event.sprint ? 'is-sprint' : 'is-gp'}"><i></i>${event.sprint ? 'Sprint' : 'Nagydíj'}</span></td>
          ${players.map(p => `<td class="event-player-points"><b>${eventTotal(p.uid)}</b></td>`).join('')}
          <td class="event-details-cell"><button type="button" class="score-detail-toggle" data-score-detail="${safeText(event.id)}" aria-expanded="false" aria-label="${safeText(event.name)} részleteinek megnyitása" title="Részletek"><span class="detail-chevron">⌄</span></button></td></tr>
          <tr class="event-detail-row hidden" id="score-detail-${safeText(event.id)}"><td colspan="${players.length + 4}"><div class="event-detail-layout"><div class="event-detail-score"><h3>${safeText(event.name)}</h3><p>Részletes pontozás</p><table class="score-detail-table"><thead><tr><th>Játékos</th><th>Pole</th><th>Idő</th><th>Győztes</th><th>Bónusz</th><th>Összesen</th></tr></thead><tbody>${details || '<tr><td colspan="6">Nincs pontadat.</td></tr>'}</tbody></table></div><div class="event-detail-note"><div class="track-map-wrap"><svg class="track-map" viewBox="0 0 240 150" role="img" aria-label="Stilizált pályarajz"><path d="M24 88 L38 44 Q43 31 59 38 L88 52 Q103 59 117 39 L139 19 Q153 9 165 25 L184 48 Q197 64 183 77 L166 91 Q155 101 172 111 L201 120 Q217 126 204 138 L168 137 Q149 136 140 119 L126 97 Q119 82 102 91 L80 109 Q63 124 48 110 Z" fill="none" stroke="#2e8cff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".22"/><path d="M24 88 L38 44 Q43 31 59 38 L88 52 Q103 59 117 39 L139 19 Q153 9 165 25 L184 48 Q197 64 183 77 L166 91 Q155 101 172 111 L201 120 Q217 126 204 138 L168 137 Q149 136 140 119 L126 97 Q119 82 102 91 L80 109 Q63 124 48 110 Z" fill="none" stroke="#72b7ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="88" r="5" fill="#ff253a"/><path d="M17 88h14" stroke="white" stroke-width="2"/></svg></div><span class="event-flag large">${eventFlag(event.name)}</span><strong>${event.sprint ? 'Sprint' : 'Nagydíj'} · ${safeText(event.name.replace(/\s*[–-]\s*Sprint$/i, '').replace(/ Grand Prix$/i, ''))}</strong><span>${event.sprint ? 'Sprint időmérő és sprintfutam' : 'Időmérő és nagydíj'}</span></div></div></td></tr>`;
      }).join('') : '<tr><td colspan="5">Nincs megjeleníthető pontozás.</td></tr>';
      $('eventScoresBody').querySelectorAll('[data-score-detail]').forEach(button => button.addEventListener('click', () => {
        const row = document.getElementById('score-detail-' + button.dataset.scoreDetail);
        if (!row) return;
        const opening = row.classList.contains('hidden');
        row.classList.toggle('hidden', !opening);
        button.setAttribute('aria-expanded', String(opening));
        button.setAttribute('aria-label', `${button.closest('tr')?.querySelector('.event-name-cell')?.innerText || 'Futam'} részleteinek ${opening ? 'bezárása' : 'megnyitása'}`);
        button.title = opening ? 'Részletek bezárása' : 'Részletek megnyitása';
      }));
    }
    const totalPoints = scores.reduce((n, s) => n + scoreNum(s, 'total'), 0);
    const eventMap = new Map();
    scores.forEach(s => {
      const id = String(s.raceId || s.scoreId);
      if (!eventMap.has(id)) eventMap.set(id, { id, name: s.raceName || `Futam ${id}`, points: 0, sprint: s.eventType === 'sprint' || id.endsWith('-sprint'), scores: [] });
      const ev = eventMap.get(id); ev.points += scoreNum(s, 'total'); ev.scores.push(s);
    });
    const events = [...eventMap.values()].sort((a,b) => eventSortValue({raceId:a.id,eventType:a.sprint?'sprint':'gp'}) - eventSortValue({raceId:b.id,eventType:b.sprint?'sprint':'gp'}));
    const maxEvent = Math.max(1, ...events.map(e => e.points));
    const componentTotals = [
      { key:'polePoints', label:'Pole pozíció', color:'red' },
      { key:'timePoints', label:'Időtipp', color:'blue' },
      { key:'winnerPoints', label:'Futamgyőztes', color:'gold' },
      { key:'bonus', label:'Bónuszpontok', color:'green' }
    ].map(c => ({...c, points:scores.reduce((n,s)=>n+scoreNum(s,c.key),0)}));
    const bestEventRows = scores.map(s=>({name:s.raceName||`Futam ${s.raceId||s.scoreId}`, points:scoreNum(s,'total'), player:nameByUid.get(s.uid)||'Versenyző', sprint:s.eventType==='sprint'||String(s.raceId||'').endsWith('-sprint')})).sort((a,b)=>b.points-a.points).slice(0,5);
    const statsNameByUid = new Map(statsUsers.map(user => [
      user.uid, user.username || user.displayName || user.name || 'Versenyző'
    ]));
    const statsTotals = new Map(statsUsers.map(user => [user.uid, {
      uid: user.uid,
      name: statsNameByUid.get(user.uid),
      team: user.team || 'ferrari',
      gp: 0, sprint: 0, total: 0, events: 0, pole: 0, time: 0, winner: 0, bonus: 0
    }]));
    statsScores.forEach(score => {
      const row = statsTotals.get(score.uid);
      if (!row) return;
      const points = scoreNum(score, 'total');
      row.total += points;
      if (score.eventType === 'sprint' || String(score.raceId || '').endsWith('-sprint')) row.sprint += points;
      else row.gp += points;
      row.events += 1;
      row.pole += scoreNum(score, 'polePoints');
      row.time += scoreNum(score, 'timePoints');
      row.winner += scoreNum(score, 'winnerPoints');
      row.bonus += scoreNum(score, 'bonus');
    });
    const statsLeaderboard = [...statsTotals.values()].sort((a, b) =>
      b.total - a.total || b.gp - a.gp || a.name.localeCompare(b.name, 'hu')
    );
    const statsEventMap = new Map();
    statsScores.forEach(score => {
      const id = String(score.raceId || score.scoreId);
      if (!statsEventMap.has(id)) statsEventMap.set(id, {
        id,
        name: score.raceName || `Futam ${id}`,
        points: 0,
        sprint: score.eventType === 'sprint' || id.endsWith('-sprint'),
        scores: []
      });
      const event = statsEventMap.get(id);
      event.points += scoreNum(score, 'total');
      event.scores.push(score);
    });
    const statsEvents = [...statsEventMap.values()].sort((a, b) =>
      eventSortValue({ raceId: a.id, eventType: a.sprint ? 'sprint' : 'gp' }) -
      eventSortValue({ raceId: b.id, eventType: b.sprint ? 'sprint' : 'gp' })
    );
    const statsComponentTotals = [
      { key: 'polePoints', label: 'Pole pozíció', color: 'red' },
      { key: 'timePoints', label: 'Időtipp', color: 'blue' },
      { key: 'winnerPoints', label: 'Futamgyőztes', color: 'gold' },
      { key: 'bonus', label: 'Bónuszpontok', color: 'green' }
    ].map(component => ({
      ...component,
      points: statsScores.reduce((sum, score) => sum + scoreNum(score, component.key), 0)
    }));
    const statsBestEventRows = statsScores.map(score => ({
      name: score.raceName || `Futam ${score.raceId || score.scoreId}`,
      points: scoreNum(score, 'total'),
      player: statsNameByUid.get(score.uid) || 'Versenyző',
      sprint: score.eventType === 'sprint' || String(score.raceId || '').endsWith('-sprint')
    })).sort((a, b) => b.points - a.points).slice(0, 5);
    const statsTotalPoints = statsScores.reduce((sum, score) => sum + scoreNum(score, 'total'), 0);

    statsSnapshotData = {
      users: statsUsers,
      scores: statsScores,
      leaderboard: statsLeaderboard,
      events: statsEvents,
      components: statsComponentTotals,
      officialEvents: null,
      tipsByEvent: {}
    };
    // Pontadatok frissítésénél a megnyitott résznézet is azonnal újrarenderelődik.
    renderStatsDetail();
    if ($('statsGroupSelect')) $('statsGroupSelect').disabled = false;
    if (statsStatus) {
      const scopeLabel = statsGroupMode === 'personal' ? 'Saját statisztika' : statsGroupMode === 'all' ? 'Összes csoportom' : (statsGroups.find(group => group.id === statsSelectedGroupId)?.name || 'Kiválasztott csoport');
      statsStatus.textContent = statsScores.length
        ? `${statsUsers.length} játékos · ${statsScores.length} Firestore-pontrekord · ${scopeLabel} · 2026`
        : `${scopeLabel}: még nincs megjeleníthető pontadat, vagy a tagokhoz nem tartozik 2026-os pontrekord.`;
    }
    if ($('statsOverviewCards')) {
      const top = statsLeaderboard[0];
      const avg = statsScores.length ? (statsTotalPoints / statsScores.length) : 0;
      const best = statsBestEventRows[0];
      const kpis = [
        {label:'Összes kiosztott pont',info:'Az összes, a kiválasztott szezonban betöltött pontrekord pontértékének összege.',value:statsTotalPoints,sub:`${statsScores.length} pontozott rekord`,icon:'✦',tone:'red'},
        {label:'Élen álló játékos',info:'Az a játékos, akinek a betöltött pontrekordok alapján a legmagasabb az összpontszáma.',value:top?.name||'—',sub:top?`${top.total} ponttal`:'Nincs adat',icon:'♛',tone:'gold'},
        {label:'Pontozott események',info:'Az adatbázisban talált különálló sprint- és nagydíj-események száma.',value:statsEvents.length,sub:`${statsEvents.filter(e=>!e.sprint).length} nagydíj · ${statsEvents.filter(e=>e.sprint).length} sprint`,icon:'▦',tone:'blue'},
        {label:'Átlagos pont / rekord',info:'Az összes pont osztva a betöltött pontrekordok számával; nem futamonkénti játékosátlag.',value:avg.toLocaleString('hu-HU',{maximumFractionDigits:1}),sub:best?`Legjobb egyéni eredmény: ${best.points} pont`:'A pontok alapján számítva',icon:'↗',tone:'green'}
      ];
      $('statsOverviewCards').innerHTML=kpis.map(k=>`<article class="stats-kpi stats-tone-${k.tone}"><span class="stats-kpi-icon">${k.icon}</span><div><small>${safeText(k.label)} <button class="stats-info" type="button" aria-label="${safeText(k.label)} magyarázata" data-tooltip="${safeText(k.info||'A mutató a betöltött Firestore-adatokból számolódik.')}">i</button></small><strong>${safeText(k.value)}</strong><span>${safeText(k.sub)}</span></div></article>`).join('');
    }
    if ($('statsCards')) {
      const max = Math.max(1, ...statsLeaderboard.map(p => p.total));
      $('statsCards').innerHTML = statsLeaderboard.map((p, i) => `
        <article class="stats-player-row"><span class="stats-player-rank">${i+1}</span><div class="stats-player-info"><strong>${safeText(p.name)}</strong><div class="stats-player-bar"><i style="width:${Math.round(p.total/max*100)}%"></i></div><small>${p.events} pontrekord · átlag ${p.events ? (p.total/p.events).toLocaleString('hu-HU',{maximumFractionDigits:1}) : '0'} pont/rekord</small></div><b>${p.total}<small> pont</small></b></article>`).join('') || '<p class="stats-empty">Nincs elérhető játékosadat.</p>';
    }
    if ($('statsCategories')) {
      const maxComp=Math.max(1,...statsComponentTotals.map(c=>c.points));
      const totalComponents=statsComponentTotals.reduce((n,c)=>n+c.points,0);
      const palette={red:'#ff3157',blue:'#328cff',gold:'#ffc247',green:'#24d6a0'};
      let angle=0;
      const stops=statsComponentTotals.map(c=>{const share=totalComponents?c.points/totalComponents*360:0;const start=angle;angle+=share;return `${palette[c.color]} ${start}deg ${angle}deg`;}).join(', ');
      $('statsCategories').innerHTML=`<div class="stats-donut-wrap"><div class="stats-donut" style="background:conic-gradient(${stops || '#24313d 0deg 360deg'})"><div class="stats-donut-center"><strong>${totalComponents}</strong><span>pont</span></div></div><div class="stats-donut-legend">${statsComponentTotals.map(c=>`<div><i class="tone-${c.color}"></i><span>${safeText(c.label)} <button class="stats-info" type="button" aria-label="${safeText(c.label)} magyarázata" data-tooltip="${safeText(({ 'Pole pozíció':'A pole pozícióhoz kapcsolódó pontok összege.','Időtipp':'A pole-időre adott tippért kapott pontok összege.','Futamgyőztes':'A futamgyőztesre adott tipp pontjai.','Bónuszpontok':'A külön bónuszként tárolt pontok összege.'})[c.label]||'Az adott kategóriához rendelt pontok összege.')}">i</button></span><b>${c.points}</b></div>`).join('')}</div></div><div class="stats-category-list">${statsComponentTotals.map(c=>`<div class="stats-category"><div class="stats-category-label"><span>${safeText(c.label)}</span><b>${c.points} <small>pont</small></b></div><div class="stats-category-track"><i class="tone-${c.color}" style="width:${Math.min(100,c.points/maxComp*100)}%"></i></div></div>`).join('')}</div>`;
    }
    if ($('pointsChart')) {
      const chartEvents=statsEvents.slice(-24);
      const width=760,height=190,pad=24;
      const maxChart=Math.max(1,...chartEvents.map(e=>e.points));
      const pts=chartEvents.map((e,i)=>({x:pad+(chartEvents.length<=1?0:i*(width-pad*2)/(chartEvents.length-1)),y:height-pad-(e.points/maxChart)*(height-pad*2),e}));
      const poly=pts.map(p=>`${p.x},${p.y}`).join(' ');
      const area=`${pad},${height-pad} ${poly} ${width-pad},${height-pad}`;
      $('pointsChart').innerHTML=chartEvents.length ? `<div class="stats-line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pontok eseményenkénti alakulása"><defs><linearGradient id="statsLineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff3157" stop-opacity=".38"/><stop offset="100%" stop-color="#ff3157" stop-opacity="0"/></linearGradient><linearGradient id="statsLineStroke"><stop offset="0%" stop-color="#ff3157"/><stop offset="100%" stop-color="#ff8b43"/></linearGradient></defs>${[0,1,2,3].map(i=>`<line x1="${pad}" y1="${pad+i*(height-pad*2)/3}" x2="${width-pad}" y2="${pad+i*(height-pad*2)/3}" stroke="#263643" stroke-dasharray="3 5"/>`).join('')}<polygon points="${area}" fill="url(#statsLineFill)"/><polyline points="${poly}" fill="none" stroke="url(#statsLineStroke)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${p.e.sprint?'#3f9bff':'#ff3157'}" stroke="#08121b" stroke-width="2"><title>${safeText(p.e.name)}: ${p.e.points} pont</title></circle>`).join('')}</svg></div><div class="stats-event-labels">${chartEvents.map(e=>`<span title="${safeText(e.name)}">${safeText((e.name||'').replace(/\s*(Grand Prix|Nagydíj)$/i,'').replace(/\s*[-–]\s*Sprint$/i,'').slice(0,8))}<small>${e.sprint?'SPR':'GP'}</small></span>`).join('')}</div>` : '<p class="stats-empty">A pontozott események megjelennek, amint a Firestore tartalmaz ilyen adatokat.</p>';
    }
    if ($('statsBestEvents')) {
      $('statsBestEvents').innerHTML=statsBestEventRows.length?statsBestEventRows.map((e,i)=>`<div class="stats-best-row"><span class="stats-best-index">${String(i+1).padStart(2,'0')}</span><div><strong>${safeText(e.name)}</strong><small>${safeText(e.player)} · ${e.sprint?'Sprint':'Nagydíj'}</small></div><b>${e.points}<small> pont</small></b></div>`).join(''):'<p class="stats-empty">Még nincs pontozott esemény.</p>';
    }
  } catch (error) {
    if ($('statsGroupSelect')) $('statsGroupSelect').disabled = false;
    console.error('Ponttábla betöltési hiba:', error);
    const message = 'Nem sikerült beolvasni a pontokat. Ellenőrizd a Firestore Rules olvasási jogosultságait.';
    if (rankingStatus) rankingStatus.textContent = message + ' (' + error.message + ')';
    if (statsStatus) statsStatus.textContent = message + ' (' + error.message + ')';
  }
}
$('refreshScoresButton')?.addEventListener('click', loadScoreboard);
$('refreshStatsButton')?.addEventListener('click', loadScoreboard);
let scoreLiveUnsubs = [];
let scoreLiveStarted = false;
function startScoreLiveUpdates() {
  if(scoreLiveStarted) return; scoreLiveStarted=true;
  const ids=new Set(['A0c1CfsPutPLAoNSaiTStBFTFvs1','3ZzPzpz5cOdpc61eAvTVax2zvQz2','LadIkNLT9mdEo9d09mg2LWLcemf1']);
  const subscribeUid = uid => {
    if (!uid || ids.has('subscribed:'+uid)) return;
    ids.add('subscribed:'+uid);
    scoreLiveUnsubs.push(onSnapshot(collection(db,'users',uid,'scores'),()=>{loadScoreboard();},error=>{console.warn('Élő pontfrissítés nem érhető el:',error.message);if($('statsStatus'))$('statsStatus').textContent='Az élő frissítéshez Firestore olvasási jogosultság szükséges.';}));
  };
  [...ids].filter(x=>!x.startsWith('subscribed:')).forEach(subscribeUid);
  scoreLiveUnsubs.push(onSnapshot(collection(db,'leaderboard'),snap=>{
    snap.docs.forEach(d=>subscribeUid(d.id));
    loadScoreboard();
  },error=>console.info('Publikus ranglista élő frissítése nem érhető el:',error.message)));
}
startScoreLiveUpdates();

async function loadLeaderboardData() {
  const status = document.getElementById('leaderboardStatus');

  if (status) {
    status.textContent = 'A ranglista adatainak betöltése…';
  }

  try {
    const [playersSnap, scoresSnap, bonusesSnap] = await Promise.all([
      getDocs(collection(db, 'leaderboard')),
      getDocs(collection(db, 'eventScores')),
      getDocs(collection(db, 'bonusScores'))
    ]);

    const users = playersSnap.docs.map(d => ({
      uid: d.id,
      ...d.data()
    }));

    const eventScores = scoresSnap.docs.map(d => d.data());
    const bonusScores = bonusesSnap.docs.map(d => d.data());

    const leaderboard = buildLeaderboard(
      users,
      eventScores,
      bonusScores,
      2026
    );

    console.table(leaderboard);

    if (status) {
      status.textContent = leaderboard.length
        ? `Ranglista betöltve: ${leaderboard.length} játékos.`
        : 'Még nincsenek ranglistaadatok.';
    }

    return leaderboard;
  } catch (error) {
    console.error('Ranglista betöltési hiba:', error);

    if (status) {
      status.textContent =
        'A ranglista nem tölthető be. Ellenőrizd a Firestore-jogosultságokat.';
    }

    return [];
  }
}

// -----------------------------------------------------------------------------
// Csoport létrehozása és csatlakozás meghívókóddal
// -----------------------------------------------------------------------------
$('createGroupButton')?.addEventListener('click', async () => {
  const status = $('groupsStatus');
  const button = $('createGroupButton');
  if (!currentUser) {
    if (status) status.textContent = 'Csoport létrehozásához először jelentkezz be Google-fiókkal.';
    toast('Előbb jelentkezz be.');
    return;
  }

  const name = $('newGroupName')?.value?.trim() || '';
  if (name.length < 3) {
    if (status) status.textContent = 'A csoport neve legalább 3 karakter legyen.';
    $('newGroupName')?.focus();
    return;
  }

  button.disabled = true;
  if (status) status.textContent = 'Csoport létrehozása…';
  try {
    const groupRef = doc(collection(db, 'groups'));
    const inviteCode = makeInviteCode();
    const username = $('username')?.value?.trim() || currentUser.displayName || 'Versenyző';
    const batch = writeBatch(db);
    batch.set(groupRef, {
      name,
      season: 2026,
      status: 'active',
      createdBy: currentUser.uid,
      createdByName: username,
      inviteCode,
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'groups', groupRef.id, 'members', currentUser.uid), {
      uid: currentUser.uid,
      username,
      role: 'admin',
      joinedAt: serverTimestamp()
    });
    await batch.commit();
    $('newGroupName').value = '';
    if (status) status.textContent = `Sikeres csoportlétrehozás. Meghívókód: ${inviteCode}`;
    await loadMyGroups();
  } catch (error) {
    console.error('Csoportlétrehozási hiba:', error);
    if (status) status.textContent = `Nem sikerült létrehozni a csoportot: ${error.message || error}`;
  } finally {
    button.disabled = false;
  }
});

$('joinGroupButton')?.addEventListener('click', async () => {
  const status = $('groupsStatus');
  const button = $('joinGroupButton');
  if (!currentUser) {
    if (status) status.textContent = 'Csatlakozáshoz először jelentkezz be Google-fiókkal.';
    toast('Előbb jelentkezz be.');
    return;
  }

  const code = $('joinGroupCode')?.value?.trim()?.toUpperCase() || '';
  if (!code) {
    if (status) status.textContent = 'Írd be a meghívókódot.';
    $('joinGroupCode')?.focus();
    return;
  }

  button.disabled = true;
  if (status) status.textContent = 'Csoport keresése…';
  try {
    const found = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', code)));
    if (found.empty) {
      if (status) status.textContent = 'Nem található ilyen meghívókód. Ellenőrizd a kódot.';
      return;
    }

    const groupDoc = found.docs[0];
    const memberRef = doc(db, 'groups', groupDoc.id, 'members', currentUser.uid);
    const existing = await getDoc(memberRef);
    if (existing.exists()) {
      if (status) status.textContent = `Már tagja vagy ennek a csoportnak: ${groupDoc.data().name || 'csoport'}`;
      await loadMyGroups();
      return;
    }

    const username = $('username')?.value?.trim() || currentUser.displayName || 'Versenyző';
    await setDoc(memberRef, {
      uid: currentUser.uid,
      username,
      role: 'member',
      joinedAt: serverTimestamp()
    });

    $('joinGroupCode').value = '';
    if (status) status.textContent = `Sikeresen csatlakoztál ehhez a csoporthoz: ${groupDoc.data().name || 'csoport'}.`;
    await loadMyGroups();
  } catch (error) {
    console.error('Csoporthoz csatlakozási hiba:', error);
    if (status) status.textContent = `Nem sikerült csatlakozni: ${error.message || error}`;
  } finally {
    button.disabled = false;
  }
});
