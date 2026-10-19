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
      ${groups.map(g => `
        <option value="${safeText(g.id)}">${safeText(g.name)}</option>
      `).join('')}
    `;

    select.value = [...select.options].some(
      option => option.value === previousValue
    ) ? previousValue : 'personal';

    if (hint) {
      hint.textContent = groups.length
        ? `${groups.length} csoport elérhető.`
        : 'Még nem vagy tagja egyetlen csoportnak sem.';
    }
  } catch (error) {
    console.error('Statisztikai csoportok betöltése sikertelen:', error);
    if (hint) {
      hint.textContent =
        'A csoportok betöltése nem sikerült. Ellenőrizd a Firestore Rules jogosultságait.';
    }
  }
}

    statsGroups = groups;

    select.innerHTML = `
      <option value="personal">Saját statisztikám</option>
      <option value="all">Összes csoportom</option>
      ${groups.map(g => `
        <option value="${safeText(g.id)}">
          ${safeText(g.name)}
        </option>
      `).join('')}
    `;

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

async function applyStatsGroupSelection() {
  const select = $('statsGroupSelect');
  const selected = select?.value || 'personal';

  if (!currentUser) {
    statsGroupMemberUids = null;
    return;
  }

  if (selected === 'personal') {
    statsGroupMode = 'personal';
    statsSelectedGroupId = '';
    statsGroupMemberUids = new Set([currentUser.uid]);
  } else {
    const selectedGroups = selected === 'all'
      ? statsGroups
      : statsGroups.filter(group => group.id === selected);

    statsGroupMode = selected === 'all' ? 'all' : 'group';
    statsSelectedGroupId = selected === 'all' ? '' : selected;

    const memberUids = new Set();

    for (const group of selectedGroups) {
      const membersSnap = await getDocs(
        collection(db, 'groups', group.id, 'members')
      );

      membersSnap.forEach(memberDoc => {
        memberUids.add(memberDoc.id);
      });
    }

    statsGroupMemberUids = memberUids;
  }
}

$('statsGroupSelect')?.addEventListener('change', async () => {
  try {
    await applyStatsGroupSelection();
    officialStatsPromise = null;
    renderStatsDetail();
  } catch (error) {
    console.error('A csoportnézet frissítése sikertelen:', error);
    toast('Nem sikerült betölteni a csoport statisztikáit.');
  }
});

let officialStatsPromise = null;
const officialDriverName = d => d ? `${d.givenName || ''} ${d.familyName || ''}`.trim() : '—';
async function loadOfficialStatsData() {
  if (officialStatsPromise) return officialStatsPromise;
  officialStatsPromise = (async () => {
    const season = 2026;
    const response = await fetch(`${API_BASE}/${season}/races/?limit=100`);
    if (!response.ok) throw new Error(`F1 naptár HTTP ${response.status}`);
    const json = await response.json();
    const races = json.MRData?.RaceTable?.Races || [];
    const officialEvents = [];
    const requests = [];
    for (const race of races) {
      const sprint = Boolean(race.Sprint?.date || race.SprintQualifying?.date);
      if (sprint) officialEvents.push({ key: `${race.round}-sprint`, round: Number(race.round), name: `${race.raceName} – Sprint`, raceName: race.raceName, sprint: true, race, qualifying: null, results: null });
      officialEvents.push({ key: String(race.round), round: Number(race.round), name: race.raceName, raceName: race.raceName, sprint: false, race, qualifying: null, results: null });
    }
    // Jolpica korlátozhatja a túl sok egyidejű kérést. Két végpontot kérünk eseményenként,
    // de egyszerre csak néhány eseményt dolgozunk fel, hogy ne csak az első futam töltődjön be.
    for (let start = 0; start < officialEvents.length; start += 4) {
      const batch = officialEvents.slice(start, start + 4);
      await Promise.all(batch.map(async ev => {
        const qPath = ev.sprint ? 'sprintqualifying' : 'qualifying';
        const rPath = ev.sprint ? 'sprint' : 'results';
        const urls = [`${API_BASE}/${season}/${ev.round}/${qPath}/?limit=100`, `${API_BASE}/${season}/${ev.round}/${rPath}/?limit=100`];
        const vals = await Promise.all(urls.map(async url => {
          try {
            let r = await fetch(url);
            if (r.status === 429 || r.status >= 500) { await new Promise(resolve => setTimeout(resolve, 700)); r = await fetch(url); }
            if (!r.ok) { ev.apiError = `HTTP ${r.status}`; return null; }
            return await r.json();
          } catch (error) { ev.apiError = error?.message || 'Hálózati hiba'; return null; }
        }));
        ev.qualifying = vals[0]?.MRData?.RaceTable?.Races?.[0]?.QualifyingResults || vals[0]?.MRData?.RaceTable?.Races?.[0]?.SprintQualifyingResults || [];
        ev.results = vals[1]?.MRData?.RaceTable?.Races?.[0]?.SprintResults || vals[1]?.MRData?.RaceTable?.Races?.[0]?.Results || [];
        const q1 = ev.qualifying.find(x => Number(x.position) === 1) || null;
        ev.poleDriver = q1 ? officialDriverName(q1.Driver) : '';
        ev.poleDriverId = q1?.Driver?.driverId || '';
        ev.poleCode = q1?.Driver?.code || '';
        ev.poleTime = q1?.Q3 || q1?.SQ3 || q1?.Q2 || q1?.SQ2 || q1?.Q1 || q1?.SQ1 || '';
        const win = ev.results.find(x => Number(x.position) === 1) || null;
        ev.winner = win ? officialDriverName(win.Driver) : '';
        ev.winnerDriverId = win?.Driver?.driverId || '';
        ev.winnerCode = win?.Driver?.code || '';
        ev.driverNames = Object.fromEntries([...ev.qualifying, ...ev.results].filter(x=>x.Driver?.driverId).map(x=>[x.Driver.driverId, officialDriverName(x.Driver)]));
        ev.date = ev.sprint ? (ev.race.Sprint?.date || ev.race.SprintQualifying?.date || ev.race.date) : ev.race.date;
      }));
      if (start + 4 < officialEvents.length) await new Promise(resolve => setTimeout(resolve, 250));
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
      const status=$('statsOfficialStatus'); if(status) { const tipCount=Object.values(tipsByEvent).reduce((n,a)=>n+a.length,0); const failed=officialEvents.filter(e=>!e.poleDriver&&!e.winner).length; status.textContent=`Hivatalos F1-adatok: Jolpica API${failed?` · ${failed} esemény eredménye még nem érhető el`:''} · Betöltött tipprekordok: ${tipCount}${tipCount?'':' · más játékosok tippjeihez ellenőrizd a Firestore Rules jogosultságait'}`; }
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
            const keys = [t.raceId, t._tipDocId, t.eventId, t.raceName].map(normalizedEventKey);
            return keys.some(k => k && eventAliases.has(k));
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
          const deltaLabel = (guess, official) => { const a=timeToMs(guess), b=timeToMs(official); if(a===null||b===null)return ''; const diff=Math.abs(a-b); const seconds=(diff/1000).toFixed(3); return `${a===b?'Pontos idő':`${seconds} mp eltérés`}`; };
          const detailRows=canonicalPlayers.map(player=>{
            const tip=tipFor(player);
            const tipPole=tip?.poleDriver||''; const tipTime=tip?.poleTime||''; const tipWinner=tip?.winnerDriver||'';
            const driverLabel=id=>id?(ev.driverNames?.[id]||id):'';
            const resultMark=(kind,guess,official)=>{if(!guess)return '<span class="stats-result-pill muted">Nincs tipp</span>';if(!official)return '<span class="stats-result-pill muted">Eredményre vár</span>';const correct=kind==='time'?String(guess).trim()===String(official).trim():String(guess).toLowerCase()===String(official).toLowerCase();return `<span class="stats-result-pill ${correct?'correct':'wrong'}">${correct?'✓':'×'} ${correct?'Talált':'Nem talált'}</span>`;};
            const score=eventScores.find(s=>s.uid===player.uid) || null;
            const storedTotal=score?scoreNum(score,'total'):null;
            const polePoints=scoreFor(player.uid,'pole'),timePoints=scoreFor(player.uid,'time'),winnerPoints=scoreFor(player.uid,'winner');
            const shownTip=value=>value?esc(value):'<span class="stats-muted">—</span>';
            const poleOfficial=ev.poleDriver ? `${esc(ev.poleDriver)}` : 'Eredményre vár';
            const timeDelta=tipTime&&ev.poleTime?`<small class="stats-time-delta ${timeToMs(tipTime)!==null&&timeToMs(ev.poleTime)!==null&&timeToMs(tipTime)===timeToMs(ev.poleTime)?'correct':'wrong'}">${esc(deltaLabel(tipTime,ev.poleTime))}</small>`:'';
            return `<tr><td><strong>${esc(player.name)}</strong></td><td>${shownTip(driverLabel(tipPole))}<small class="stats-cell-status">${resultMark('driver',tipPole,ev.poleDriverId)}</small></td><td>${shownTip(tipTime)}${timeDelta}<small class="stats-cell-status">${resultMark('time',tipTime,ev.poleTime)}</small></td><td>${shownTip(driverLabel(tipWinner))}<small class="stats-cell-status">${resultMark('driver',tipWinner,ev.winnerDriverId)}</small></td><td class="stats-total-cell">${storedTotal===null?'—':fmt(storedTotal)}<small class="stats-cell-points">${polePoints===null&&timePoints===null&&winnerPoints===null?'Pontbontás nem elérhető':`Pole ${polePoints===null?'—':fmt(polePoints)} · Idő ${timePoints===null?'—':fmt(timePoints)} · Győztes ${winnerPoints===null?'—':fmt(winnerPoints)}`}</small></td></tr>`;
          }).join('');
          const eventId=`stats-official-${String(ev.key).replace(/[^a-z0-9-]/gi,'-')}`;
          const formatDate=ev.date?new Date(`${ev.date}T12:00:00`).toLocaleDateString('hu-HU',{year:'numeric',month:'short',day:'numeric'}):'Dátum nincs';
          const summaryPole=ev.poleDriver?`${esc(ev.poleDriver)}${ev.poleTime?' · '+esc(ev.poleTime):''}`:'Még nincs hivatalos időmérőeredmény';
          const summaryWinner=ev.winner?esc(ev.winner):'Még nincs hivatalos futameredmény';
          const avg=eventScores.length?(eventScores.reduce((n,s)=>n+scoreNum(s,'total'),0)/eventScores.length).toLocaleString('hu-HU',{maximumFractionDigits:1}):'—';
          const max=eventScores.length?Math.max(...eventScores.map(s=>scoreNum(s,'total'))):'—';
          return `<article class="stats-official-event"><button type="button" class="stats-official-summary" data-official-event="${eventId}" aria-expanded="false"><span class="stats-official-round">${ev.round}${ev.sprint?'S':''}</span><span class="stats-official-name"><strong>${esc(ev.raceName)}${ev.sprint?' – Sprint':''}</strong><small>${esc(ev.race.Circuit?.circuitName||'')} · ${formatDate}</small></span><span class="stats-official-type ${ev.sprint?'sprint':''}">${ev.sprint?'Sprint':'Nagydíj'}</span><span class="stats-official-fact"><small>Pole</small><strong>${summaryPole}</strong></span><span class="stats-official-fact"><small>Győztes</small><strong>${summaryWinner}</strong></span><span class="stats-official-fact stats-event-kpi"><small>Mezőnyátlag</small><strong>${avg}</strong></span><span class="stats-official-fact stats-event-kpi"><small>Max. pont</small><strong>${max}</strong></span><span class="stats-official-chevron" aria-hidden="true">⌄</span></button><div id="${eventId}" class="stats-official-detail hidden"><div class="stats-official-result-cards"><div><small>Hivatalos pole-idő</small><strong>${ev.poleTime?esc(ev.poleTime):'Még nincs hivatalos idő'}</strong></div><div><small>Hivatalos pole</small><strong>${ev.poleDriver?esc(ev.poleDriver):'Még nincs hivatalos időmérőeredmény'}</strong></div><div><small>Futamgyőztes</small><strong>${ev.winner?esc(ev.winner):'Még nincs hivatalos futameredmény'}</strong></div></div><div class="stats-official-table-wrap"><table class="stats-data-table stats-prediction-table"><thead><tr><th>Játékos</th><th>Pole tipp</th><th>Pole-idő tipp</th><th>Futamgyőztes tipp</th><th>Összes pont</th></tr></thead><tbody>${detailRows||'<tr><td colspan="5">Nincs elérhető játékosadat.</td></tr>'}</tbody></table></div><p class="stats-scoring-note">A hivatalos eredmények a Jolpica F1 API-ból érkeznek. A pontokat a meglévő Firestore-rekordokból olvassuk; a hiányzó pontokat nem becsüljük meg.</p></div></article>`;
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
    statsSnapshotData = { users, scores, leaderboard, events, components: componentTotals.map(c=>({...c})).map(c=>({...c,points:Number(c.points||0)})) };
    // Pontadatok frissítésénél a megnyitott résznézet is azonnal újrarenderelődik.
    renderStatsDetail();
    if (statsStatus) statsStatus.textContent = scores.length
      ? `${users.length} játékos · ${scores.length} Firestore-pontrekord · 2026-os szezon`
      : 'Még nincs megjeleníthető pontadat, vagy nincs olvasási jogosultság.';
    if ($('statsOverviewCards')) {
      const top = leaderboard[0];
      const avg = scores.length ? (totalPoints / scores.length) : 0;
      const best = bestEventRows[0];
      const kpis = [
        {label:'Összes kiosztott pont',info:'Az összes, a kiválasztott szezonban betöltött pontrekord pontértékének összege.',value:totalPoints,sub:`${scores.length} pontozott rekord`,icon:'✦',tone:'red'},
        {label:'Élen álló játékos',info:'Az a játékos, akinek a betöltött pontrekordok alapján a legmagasabb az összpontszáma.',value:top?.name||'—',sub:top?`${top.total} ponttal`:'Nincs adat',icon:'♛',tone:'gold'},
        {label:'Pontozott események',info:'Az adatbázisban talált különálló sprint- és nagydíj-események száma.',value:events.length,sub:`${events.filter(e=>!e.sprint).length} nagydíj · ${events.filter(e=>e.sprint).length} sprint`,icon:'▦',tone:'blue'},
        {label:'Átlagos pont / rekord',info:'Az összes pont osztva a betöltött pontrekordok számával; nem futamonkénti játékosátlag.',value:avg.toLocaleString('hu-HU',{maximumFractionDigits:1}),sub:best?`Legjobb egyéni eredmény: ${best.points} pont`:'A pontok alapján számítva',icon:'↗',tone:'green'}
      ];
      $('statsOverviewCards').innerHTML=kpis.map(k=>`<article class="stats-kpi stats-tone-${k.tone}"><span class="stats-kpi-icon">${k.icon}</span><div><small>${safeText(k.label)} <button class="stats-info" type="button" aria-label="${safeText(k.label)} magyarázata" data-tooltip="${safeText(k.info||'A mutató a betöltött Firestore-adatokból számolódik.')}">i</button></small><strong>${safeText(k.value)}</strong><span>${safeText(k.sub)}</span></div></article>`).join('');
    }
    if ($('statsCards')) {
      const max = Math.max(1, ...leaderboard.map(p => p.total));
      $('statsCards').innerHTML = leaderboard.map((p, i) => `
        <article class="stats-player-row"><span class="stats-player-rank">${i+1}</span><div class="stats-player-info"><strong>${safeText(p.name)}</strong><div class="stats-player-bar"><i style="width:${Math.round(p.total/max*100)}%"></i></div><small>${p.events} pontrekord · átlag ${p.events ? (p.total/p.events).toLocaleString('hu-HU',{maximumFractionDigits:1}) : '0'} pont/rekord</small></div><b>${p.total}<small> pont</small></b></article>`).join('') || '<p class="stats-empty">Nincs elérhető játékosadat.</p>';
    }
    if ($('statsCategories')) {
      const maxComp=Math.max(1,...componentTotals.map(c=>c.points));
      const totalComponents=componentTotals.reduce((n,c)=>n+c.points,0);
      const palette={red:'#ff3157',blue:'#328cff',gold:'#ffc247',green:'#24d6a0'};
      let angle=0;
      const stops=componentTotals.map(c=>{const share=totalComponents?c.points/totalComponents*360:0;const start=angle;angle+=share;return `${palette[c.color]} ${start}deg ${angle}deg`;}).join(', ');
      $('statsCategories').innerHTML=`<div class="stats-donut-wrap"><div class="stats-donut" style="background:conic-gradient(${stops || '#24313d 0deg 360deg'})"><div class="stats-donut-center"><strong>${totalComponents}</strong><span>pont</span></div></div><div class="stats-donut-legend">${componentTotals.map(c=>`<div><i class="tone-${c.color}"></i><span>${safeText(c.label)} <button class="stats-info" type="button" aria-label="${safeText(c.label)} magyarázata" data-tooltip="${safeText(({ 'Pole pozíció':'A pole pozícióhoz kapcsolódó pontok összege.','Időtipp':'A pole-időre adott tippért kapott pontok összege.','Futamgyőztes':'A futamgyőztesre adott tipp pontjai.','Bónuszpontok':'A külön bónuszként tárolt pontok összege.'})[c.label]||'Az adott kategóriához rendelt pontok összege.')}">i</button></span><b>${c.points}</b></div>`).join('')}</div></div><div class="stats-category-list">${componentTotals.map(c=>`<div class="stats-category"><div class="stats-category-label"><span>${safeText(c.label)}</span><b>${c.points} <small>pont</small></b></div><div class="stats-category-track"><i class="tone-${c.color}" style="width:${Math.min(100,c.points/maxComp*100)}%"></i></div></div>`).join('')}</div>`;
    }
    if ($('pointsChart')) {
      const chartEvents=events.slice(-24);
      const width=760,height=190,pad=24;
      const maxChart=Math.max(1,...chartEvents.map(e=>e.points));
      const pts=chartEvents.map((e,i)=>({x:pad+(chartEvents.length<=1?0:i*(width-pad*2)/(chartEvents.length-1)),y:height-pad-(e.points/maxChart)*(height-pad*2),e}));
      const poly=pts.map(p=>`${p.x},${p.y}`).join(' ');
      const area=`${pad},${height-pad} ${poly} ${width-pad},${height-pad}`;
      $('pointsChart').innerHTML=chartEvents.length ? `<div class="stats-line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pontok eseményenkénti alakulása"><defs><linearGradient id="statsLineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff3157" stop-opacity=".38"/><stop offset="100%" stop-color="#ff3157" stop-opacity="0"/></linearGradient><linearGradient id="statsLineStroke"><stop offset="0%" stop-color="#ff3157"/><stop offset="100%" stop-color="#ff8b43"/></linearGradient></defs>${[0,1,2,3].map(i=>`<line x1="${pad}" y1="${pad+i*(height-pad*2)/3}" x2="${width-pad}" y2="${pad+i*(height-pad*2)/3}" stroke="#263643" stroke-dasharray="3 5"/>`).join('')}<polygon points="${area}" fill="url(#statsLineFill)"/><polyline points="${poly}" fill="none" stroke="url(#statsLineStroke)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${p.e.sprint?'#3f9bff':'#ff3157'}" stroke="#08121b" stroke-width="2"><title>${safeText(p.e.name)}: ${p.e.points} pont</title></circle>`).join('')}</svg></div><div class="stats-event-labels">${chartEvents.map(e=>`<span title="${safeText(e.name)}">${safeText((e.name||'').replace(/\s*(Grand Prix|Nagydíj)$/i,'').replace(/\s*[-–]\s*Sprint$/i,'').slice(0,8))}<small>${e.sprint?'SPR':'GP'}</small></span>`).join('')}</div>` : '<p class="stats-empty">A pontozott események megjelennek, amint a Firestore tartalmaz ilyen adatokat.</p>';
    }
    if ($('statsBestEvents')) {
      $('statsBestEvents').innerHTML=bestEventRows.length?bestEventRows.map((e,i)=>`<div class="stats-best-row"><span class="stats-best-index">${String(i+1).padStart(2,'0')}</span><div><strong>${safeText(e.name)}</strong><small>${safeText(e.player)} · ${e.sprint?'Sprint':'Nagydíj'}</small></div><b>${e.points}<small> pont</small></b></div>`).join(''):'<p class="stats-empty">Még nincs pontozott esemény.</p>';
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
