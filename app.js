// -----------------------------------------------------------------------------
// 1. Firebase inicializálása és közös segédfüggvények
// -----------------------------------------------------------------------------
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
const firebaseConfig = { apiKey: 'AIzaSyBb-ZNy-Nvsjir_ndT1dB_xX4ajZrbTd08', authDomain: 'f1-tipp-2027.firebaseapp.com', projectId: 'f1-tipp-2027', storageBucket: 'f1-tipp-2027.firebasestorage.app', messagingSenderId: '13870451311', appId: '1:13870451311:web:afdf86ca30b8aa01a79b9a' };
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
let currentUser = null;
const $ = id => document.getElementById(id);
function toast(message) { const t = $('toast'); t.textContent = message; t.classList.remove('hidden'); clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => t.classList.add('hidden'), 4200); }
// -----------------------------------------------------------------------------
// 2. Profilbeállítások mentése, Google-bejelentkezés és munkamenet kezelése
// -----------------------------------------------------------------------------
$('settingsCancel').addEventListener('click', () => $('settingsOverlay').classList.add('hidden'));
$('saveProfileButton').addEventListener('click', async () => {
  if (!currentUser) {
    toast('Előbb jelentkezz be.');
    return;
  } const displayName = $('displayName').value.trim(), username = $('username').value.trim(); if (!displayName) {
    $('profileStatus').textContent = 'Adj meg egy megjelenített nevet.';
    return;
  } if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    $('profileStatus').textContent = 'A felhasználónév 3–20 karakter legyen: betűk, számok, aláhúzás.';
    return;
  } const data = { displayName, username, team: $('teamSelect').value, themeMode: $('standardTheme').checked ? 'standard' : 'team', favoriteDriver: $('driverSelect').value, email: currentUser.email || '', photoURL: currentUser.photoURL || '', updatedAt: serverTimestamp() }; try {
    await setDoc(doc(db, 'users', currentUser.uid), data, { merge: true });
    $('headerName').textContent = displayName;
    $('headerTeam').textContent = data.team.toUpperCase() + ' SZURKOLÓ';
    $('settingsOverlay').classList.add('hidden');
    toast('Profilbeállítások elmentve a Firebase-be.');
  }
  catch (e) {
    $('profileStatus').textContent = 'Mentési hiba: ' + e.message;
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
onAuthStateChanged(auth, async (user) => {
  currentUser = user; $('loginOpen').classList.toggle('hidden', !!user); $('logoutButton').classList.toggle('hidden', !user); $('headerName').textContent = user?.displayName || 'Vendég'; $('headerTeam').textContent = user ? 'F1 Tipp 2026' : 'Jelentkezz be'; const av = $('headerAvatar'); if (user?.photoURL) {
    av.src = user.photoURL;
    av.classList.remove('hidden');
  }
  else {
    av.removeAttribute('src');
    av.classList.add('hidden');
  } if (user) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        $('headerName').textContent = d.displayName || user.displayName || 'Versenyző';
        $('headerTeam').textContent = d.team ? d.team.toUpperCase() + ' SZURKOLÓ' : 'F1 Tipp 2026';
        $('displayName').value = d.displayName || user.displayName || '';
        $('username').value = d.username || '';
        $('teamSelect').value = d.team || 'ferrari';
        $('driverSelect').value = d.favoriteDriver || 'leclerc';
        $('standardTheme').checked = d.themeMode === 'standard';
      }
      else {
        await setDoc(doc(db, 'users', user.uid), { displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '', team: 'ferrari', themeMode: 'team', favoriteDriver: 'leclerc', updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    catch (e) {
      console.warn('Profilbetöltési hiba', e);
      toast('A bejelentkezés sikerült, de a profiladatok most nem tölthetők be.');
    }
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
function openSection(key) {
  if (key === 'settings') {
    if (!currentUser) {
      $('loginOverlay').classList.remove('hidden');
      $('loginStatus').textContent = 'A beállításokhoz jelentkezz be.';
      return;
    }
    $('settingsOverlay').classList.remove('hidden');
    return;
  } const messages = { tips: 'Tippjáték: a Tippjáték menüpontot a meglévő tippjáték oldalra kell kötni.', ranking: 'Ranglista: a meglévő ranglista oldalra kell kötni.', calendar: 'Naptár: a szezon versenynaptárát a Firestore race dokumentumaiból lehet betölteni.', teams: 'Csapatok: csapatlista oldal.', drivers: 'Pilóták: pilótalista oldal.', stats: 'Statisztikák: szezonadatok oldal.', rules: 'Szabályok: pontozási és játékszabályok.', settings: 'Profil- és megjelenési beállítások.' }; if (key === 'home')
    return; toast(messages[key] || 'Ez a nézet külön fejlesztési lépésben kapcsolható be.');
}
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('[data-nav]').forEach(x => x.classList.toggle('active', x === b)); openSection(b.dataset.nav); }));
function goTips() {
  if (!currentUser) {
    $('loginOverlay').classList.remove('hidden');
    $('loginStatus').textContent = 'A tippekhez először jelentkezz be.';
    return;
  } toast('A tippjáték oldal összekötése következő lépésben: a meglévő Firebase-adatokat nem módosítottuk.');
}
['heroTipButton', 'categoryTipButton'].forEach(id => $(id).addEventListener('click', goTips));
$('raceDetailsButton').addEventListener('click', () => toast('A versenyhétvége hivatalos időpontjai a szezon adatainak bekötése után jelennek meg.'));
document.querySelectorAll('[data-category]').forEach(b => b.addEventListener('click', goTips));

