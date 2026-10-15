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
  where
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
    email: currentUser.email || '',
    photoURL: currentUser.photoURL || '',
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'users', currentUser.uid), data, { merge: true });

    $('headerName').textContent = username;
    $('headerTeam').textContent = data.team.toUpperCase() + ' SZURKOLÓ';
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
      applyTeamTheme();
    } else {
      await setDoc(doc(db, 'users', user.uid), {
        username: '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        team: 'ferrari',
        themeMode: 'team',
        favoriteDriver: 'leclerc',
        updatedAt: serverTimestamp()
      }, { merge: true });

      $('teamSelect').value = 'ferrari';
      $('driverSelect').value = 'leclerc';
      $('standardTheme').checked = false;
      applyTeamTheme();
    }
  } catch (e) {
    console.warn('Profilbetöltési hiba', e);
    toast('A bejelentkezés sikerült, de a profiladatok most nem tölthetők be.');
  }
});

$('loginOpen').addEventListener('click', () => { $('loginOverlay').classList.remove('hidden'); $('loginStatus').textContent = ''; });
$('loginCancel').addEventListener('click', () => $('loginOverlay').classList.add('hidden'));
$('loginButton').addEventListener('click', async () => {
  const b = $('loginButton'); b.disabled = true; $('loginStatus').textContent = 'Kapcsolódás a Google-fiókhoz…'; try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
    $('loginOverlay').classList.add('hidden');
  }
    catch (e) {
      $('loginStatus').textContent = ({ 'auth/popup-closed-by-user': 'A belépési ablak bezárult.', 'auth/popup-blocked': 'A böngésző blokkolta a belépési ablakot.', 'auth/unauthorized-domain': 'Ez a domain nincs engedélyezve a Firebase-ben.' })[e.code] || ('Sikertelen belépés: ' + e.message);
      $('loginStatus').classList.add('error');
    }
    finally {
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
  'americas': { length: 5.513, corners: 20, laps: 56, traits: [2, 3, 3, 4], traitText: ['Közepes', 'Magas', 'Magas', 'Hosszú'], lat: 30.1328, lon: -97.6411, timezone: 'America/Chicago', fact: 'A Circuit of The Americas pályán jelentős szintkülönbség és többféle kanyartípus teszi változatossá a beállításokat.' },
  'rodriguez': { length: 4.304, corners: 17, laps: 71, traits: [3, 2, 3, 4], traitText: ['Magas', 'Közepes', 'Magas', 'Hosszú'], lat: 19.4042, lon: -99.0907, timezone: 'America/Mexico_City', fact: 'A pálya több mint 2 200 méterrel a tengerszint felett fekszik, ami komoly kihívás a hűtésnek és az aerodinamikának.' },
  'interlagos': { length: 4.309, corners: 15, laps: 71, traits: [3, 4, 4, 3], traitText: ['Magas', 'Magas', 'Magas', 'Közepes'], lat: -23.7036, lon: -46.6997, timezone: 'America/Sao_Paulo', fact: 'Interlagos rövid, hullámzó pálya, ahol az időjárás gyorsan megváltozhat.' },
  'vegas': { length: 6.201, corners: 17, laps: 50, traits: [1, 2, 3, 4], traitText: ['Alacsony', 'Közepes', 'Magas', 'Hosszú'], lat: 36.1147, lon: -115.1728, timezone: 'America/Los_Angeles', fact: 'A Las Vegas-i pálya hosszú egyenesei és hűvös éjszakai körülményei különleges gumikezelést igényelnek.' },
  'losail': { length: 5.419, corners: 16, laps: 57, traits: [3, 4, 2, 3], traitText: ['Magas', 'Magas', 'Közepes', 'Közepes'], lat: 25.49, lon: 51.4542, timezone: 'Asia/Qatar', fact: 'Losail gyors kanyarjai nagy terhelést adnak a gumiknak.' },
  'yas_marina': { length: 5.281, corners: 16, laps: 58, traits: [3, 2, 3, 3], traitText: ['Magas', 'Közepes', 'Magas', 'Közepes'], lat: 24.4672, lon: 54.6031, timezone: 'Asia/Dubai', fact: 'A Yas Marina-i futam naplementében indul, ezért a pályahőmérséklet a verseny alatt is változik.' }
};
function profileFor(race) { const id = (race.Circuit?.circuitId || '').toLowerCase(); return trackProfiles[id] || { length: null, corners: null, laps: null, traits: [2, 2, 2, 2], traitText: ['Közepes', 'Közepes', 'Közepes', 'Közepes'], lat: Number(race.Circuit?.Location?.lat) || 0, lon: Number(race.Circuit?.Location?.long) || 0, timezone: 'auto', fact: 'A pályaprofil részletes adatait a Firestore races gyűjteményében lehet megadni.' }; }
function setTraitRows(profile) {
  const rows = document.querySelectorAll('.bars .bar-row'); rows.forEach((row, i) => {
    const n = profile.traits?.[i] ?? 2; row.querySelectorAll('.bar i').forEach((el, j) => el.classList.toggle('on', j < n)); const label = row.querySelector('em'); if (label)
      label.textContent = profile.traitText?.[i] || 'Közepes';
  });
}
function formatRaceDate(race) { const d = new Date(`${race.date}T${race.time || '12:00:00Z'}`); return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
async function loadRace() {
  let races = [];
  try {
    const res = await fetch(`${API_BASE}/2026/races/?limit=100`);
    if (!res.ok)
      throw Error('Jolpica API HTTP ' + res.status);
    const json = await res.json();
    races = json.MRData?.RaceTable?.Races || [];
  }
  catch (e) {
    console.warn('2026 race schedule unavailable', e);
    $('heroStatus').textContent = 'A versenynaptár API most nem érhető el. Próbáld újra később.';
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
  $('heroStatus').textContent = `2026-os szezon · ${next.round ? 'Forduló ' + next.round : 'Következő futam'} · Jolpica F1 API`;
  $('trackLength').textContent = race.length ? Number(race.length).toLocaleString('hu-HU', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' km' : '—';
  $('trackCorners').textContent = race.corners ?? '—';
  $('raceDistance').textContent = (race.length && race.laps) ? (race.length * race.laps).toLocaleString('hu-HU', { maximumFractionDigits: 3 }) + ' km' : '—';
  if (race.heroImageUrl) {
    document.querySelector('.hero').style.backgroundImage = `linear-gradient(90deg,#020609 0%,#03090def 27%,#07101870 62%,#050a0e30),linear-gradient(0deg,#050a0e 0%,transparent 35%),url("${race.heroImageUrl}")`;
  }
  if (race.trackSvgPath) {
    const path = document.querySelector('.track-svg path');
    if (path)
      path.setAttribute('d', race.trackSvgPath);
  }
  setTraitRows(race);
  $('interestingFact').textContent = 'ⓘ ' + (race.fact || 'A pálya jellemzői a verseny helyszíne alapján frissülnek.');
  if (race.tyres) {
    $('hardCompound').textContent = race.tyres.hard || '—';
    $('mediumCompound').textContent = race.tyres.medium || '—';
    $('softCompound').textContent = race.tyres.soft || '—';
    $('tyreSource').textContent = race.tyreSource || 'Gumikeverék: Firestore versenyadat';
  }
  else {
    $('hardCompound').textContent = 'Nincs adat';
    $('mediumCompound').textContent = 'Nincs adat';
    $('softCompound').textContent = 'Nincs adat';
    $('tyreSource').textContent = 'A pontos C1–C5 kiosztást a races/2026-' + circuitId + ' Firestore-dokumentumban add meg, ha a hivatalos adat elérhető.';
  }
  loadWeather(race, next).catch(e => { console.warn('Weather error', e); $('weatherSummary').textContent = 'Az előrejelzés jelenleg nem érhető el.'; $('weatherSource').textContent = 'Forrás: Open-Meteo · később próbáld újra.'; });
  updateCountdown(race.date);
  document.querySelectorAll('[data-category]').forEach(b => {
    const small = b.querySelector('small'); if (small && b.dataset.category === 'winner')
      small.textContent = 'Ki nyeri a ' + race.name + '-t?';
  });
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
      $('tipPoleDriver').value = tip.poleDriver || '';
      $('tipPoleTime').value = tip.poleTime || '';
      $('tipWinnerDriver').value = tip.winnerDriver || '';
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
      : poleField.value;

    const poleTime = timeField.disabled
      ? (oldTip.poleTime || '')
      : timeField.value.trim();

    const winnerDriver = winnerField.disabled
      ? (oldTip.winnerDriver || '')
      : winnerField.value;

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

    await setDoc(tipRef, {
      raceId,
      raceName: option.dataset.raceName || option.textContent,
      poleDriver,
      poleTime,
      winnerDriver,
      updatedAt: serverTimestamp()
    });

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
$('saveTipsButton').addEventListener('click', saveTips);
setInterval(() => {
  updateTipLocks();
}, 30000);
function showOnlyPage(pageId) {
  const content = document.querySelector('.content');
  if (!content) return;
  [...content.children].forEach(el => {
    const isFooter = el.classList.contains('footer');
    const isPage = ['tipsPage', 'groupsPage', 'rankingPage', 'statsPage', 'calendarPage'].includes(el.id);
    if (isPage) el.classList.toggle('hidden', el.id !== pageId);
    else el.classList.toggle('hidden', pageId !== 'home' && !isFooter);
  });
  if (pageId === 'home') {
    [...content.children].forEach(el => {
      if (!['tipsPage', 'groupsPage', 'rankingPage', 'statsPage', 'calendarPage'].includes(el.id)) el.classList.remove('hidden');
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
async function initCalendar(){if(!calLoaded){try{let [res,openRes]=await Promise.all([fetch(`${API_BASE}/2026/races/?limit=100`),fetch(`${OPENF1}/meetings?year=2026`)]);if(!res.ok)throw Error('Jolpica HTTP '+res.status);let data=await res.json();let meetings=[];if(openRes.ok){try{meetings=await openRes.json();}catch(e){console.warn('OpenF1 meetings parse error',e);}}const sourceRaces=data.MRData?.RaceTable?.Races||[];const enrich=r=>{const country=r.Circuit?.Location?.country||'';const raceName=String(r.raceName||'').toLowerCase();const circuit=String(r.Circuit?.circuitName||'').toLowerCase();const norm=v=>String(v||'').toLowerCase().replace(/grand prix|formula 1|airlines|crypto.com|aramco|pirelli|qatar airways|lenovo|aws|heineken|singapore airlines|las vegas strip|round|\s+/g,' ').trim();const rn=norm(raceName),cnm=norm(circuit);const m=meetings.find(x=>{const mn=norm(x.meeting_name),sn=norm(x.circuit_short_name);return mn&&((rn&& (rn.includes(mn)||mn.includes(rn)))||(cnm&&sn&&(cnm.includes(sn)||sn.includes(cnm))));})||meetings.find(x=>String(x.country_name||'').toLowerCase()===country.toLowerCase()&&!['United States'].includes(country));return {...r,_openf1:m||null};};calRaces=sourceRaces.flatMap(raw=>{const r=enrich(raw);const out=[{...r,_eventType:'gp'}];if(r.Sprint?.date)out.push({...r,date:r.Sprint.date,time:r.Sprint.time||'12:00:00Z',_eventType:'sprint'});return out;});if(!calRaces.length)throw Error('Üres versenynaptár');calLoaded=true;calSelected=String(calRaces[0].round);cnext();clist();cmonth();ctrack();}catch(e){console.error(e);$('calendarRaceList').innerHTML='<div class="loading-state">A versenynaptár most nem tölthető be. Próbáld újra a menüpont megnyitásával.</div>';return;}}cset(calView);}
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
  poleSelect.innerHTML = '<option value="">Pilóta kiválasztása...</option>';
  winnerSelect.innerHTML = '<option value="">Pilóta kiválasztása...</option>';

  $('tipRaceInfo').textContent = 'Futamok és pilóták betöltése…';

  try {
    const [racesResponse, driversResponse] = await Promise.all([
      fetch(`${API_BASE}/2026/races/?limit=100`),
      fetch(`${API_BASE}/2026/drivers/?limit=100`)
    ]);

    if (!racesResponse.ok || !driversResponse.ok) {
      throw new Error('Az F1 API nem adott vissza sikeres választ.');
    }

    const racesData = await racesResponse.json();
    const driversData = await driversResponse.json();

    const races = racesData.MRData?.RaceTable?.Races || [];
    const drivers = driversData.MRData?.DriverTable?.Drivers || [];

    

races.forEach(race => {
  const hasSprint = Boolean(race.Sprint || race.SprintQualifying);
  const baseName = (race.raceName || '').replace(/ Grand Prix$/i, '');

  function addRaceOption(eventType, label, eventId) {
    const option = document.createElement('option');
    option.value = eventId;
    option.textContent = label;

    option.dataset.raceName = label;
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



    drivers.forEach(driver => {
      const name = `${driver.givenName} ${driver.familyName}`;

      [poleSelect, winnerSelect].forEach(select => {
        const option = document.createElement('option');
        option.value = driver.driverId;
        option.textContent = name;
        select.appendChild(option);
      });
    });

    $('tipRaceInfo').textContent =
      `${races.length} futam és ${drivers.length} pilóta betöltve.`;
    updateTipLocks();
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
  const n = Number(score?.[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function eventSortValue(score) {
  const m = String(score.raceId || '').match(/^(\d+)/);
  return (m ? Number(m[1]) : 999) * 10 + (score.eventType === 'sprint' ? 0 : 1);
}
async function loadScoreboard() {
  const rankingStatus = $('rankingStatus');
  const statsStatus = $('statsStatus');
  if (rankingStatus) rankingStatus.textContent = 'Pontok betöltése a Firestore-ból…';
  if (statsStatus) statsStatus.textContent = 'Statisztikák betöltése a Firestore-ból…';
  try {
    // Tesztprojekt: ne olvassuk le a teljes /users gyűjteményt,
    // mert az privát profiladatokat tartalmaz. A tesztfelhasználók UID-jeit
    // explicit listából használjuk, és csak a scores alkollekciót kérjük le.
    const users = [
      { uid: 'A0c1CfsPutPLAoNSaiTStBFTFvs1', username: 'Geri', team: 'mercedes' },
      { uid: '3ZzPzpz5cOdpc61eAvTVax2zvQz2', username: 'Nándi', team: 'williams' },
      { uid: 'LadIkNLT9mdEo9d09mg2LWLcemf1', username: 'Áron', team: 'redbull' }
    ];
    const scoreResults = await Promise.all(users.map(async user => {
      const snap = await getDocs(collection(db, 'users', user.uid, 'scores'));
      return snap.docs.map(d => ({ uid: user.uid, scoreId: d.id, ...d.data() }));
    }));
    const scores = scoreResults.flat().filter(s => Number(s.year || 2026) === 2026);
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
    if (statsStatus) statsStatus.textContent = `Összesen ${scores.reduce((n, s) => n + scoreNum(s, 'total'), 0)} pont · ${scores.length} pontozott esemény`;
    if ($('statsCards')) {
      const max = Math.max(1, ...leaderboard.map(p => p.total));
      $('statsCards').innerHTML = leaderboard.map(p => `
        <article class="rank-card"><div class="rank-name">${safeText(p.name)}</div>
        <div class="rank-total">${p.total} <small>pont</small></div>
        <div class="stat-breakdown"><span>Pole: ${p.pole}</span><span>Idő: ${p.time}</span><span>Győztes: ${p.winner}</span><span>Bónusz: ${p.bonus}</span></div>
        <div class="score-progress"><i style="width:${Math.round(p.total / max * 100)}%"></i></div>
        <small>${p.events} pontozott esemény · átlag ${p.events ? (p.total / p.events).toFixed(1).replace('.', ',') : '0'} pont/esemény</small></article>`).join('');
    }
    if ($('pointsChart')) {
      const byEvent = new Map();
      scores.forEach(s => {
        const id = String(s.raceId || s.scoreId);
        if (!byEvent.has(id)) byEvent.set(id, { name: s.raceName || id, points: 0, sprint: s.eventType === 'sprint' || id.endsWith('-sprint') });
        byEvent.get(id).points += scoreNum(s, 'total');
      });
      $('pointsChart').innerHTML = [...byEvent.values()].sort((x, y) => {
        const nx = Number((x.name.match(/^\d+/) || [999])[0]);
        const ny = Number((y.name.match(/^\d+/) || [999])[0]);
        return nx - ny;
      }).map(e => `<div class="chart-row"><span>${safeText(e.name)}</span><div class="chart-track"><i style="width:${Math.min(100, e.points / Math.max(1, ...[...byEvent.values()].map(v => v.points)) * 100)}%"></i></div><b>${e.points}</b></div>`).join('');
    }
  } catch (error) {
    console.error('Ponttábla betöltési hiba:', error);
    const message = 'Nem sikerült beolvasni a pontokat. Ellenőrizd a Firestore Rules olvasási jogosultságait.';
    if (rankingStatus) rankingStatus.textContent = message + ' (' + error.message + ')';
    if (statsStatus) statsStatus.textContent = message + ' (' + error.message + ')';
  }
}
$('refreshScoresButton')?.addEventListener('click', loadScoreboard);
$('refreshStatsButton')?.addEventListener('click', loadScoreboard);

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
