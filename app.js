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
  timeField.disabled = isSprint || poleLocked;

  winnerField.disabled = winnerLocked;
}



$('tipRaceSelect').addEventListener('change', showRaceSchedule);
$('tipRaceSelect').addEventListener('change', loadSavedTip);
$('tipRaceSelect').addEventListener('change', updateTipLocks);
$('saveTipsButton').addEventListener('click', saveTips);
setInterval(() => {
  updateTipLocks();
}, 30000);
function showTipsPage() {
  const content = document.querySelector('.content');
  const tipsPage = $('tipsPage');

  if (!content || !tipsPage) {
    toast('A tippoldal HTML-része hiányzik. Ellenőrizd az index.html módosítását.');
    return;
  }

  [...content.children].forEach(el => {
    el.classList.toggle('hidden', el !== tipsPage && !el.classList.contains('footer'));
  });

  tipsPage.classList.remove('hidden');
}

function showHomePage() {
  const content = document.querySelector('.content');
  if (!content) return;

  [...content.children].forEach(el => {
    el.classList.remove('hidden');
  });
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

  if (key === 'tips') {
    goTips();
    return;
  }

  if (key === 'home') {
    showHomePage();
    return;
  }

  if (key === 'teams') {
    showGroupsPage();
    return;
  }

  showHomePage();

  const messages = {
    ranking: 'A ranglista bekötése következik.',
    calendar: 'A naptár bekötése következik.',
    drivers: 'A pilótalista bekötése következik.',
    stats: 'A statisztikák bekötése következik.',
    rules: 'A játékszabályok bekötése következik.'
  };

  toast(messages[key] || 'Ez a nézet később készül el.');
}

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
