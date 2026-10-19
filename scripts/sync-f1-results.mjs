import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const SEASON = 2026;
const API_BASE = 'https://api.jolpi.ca/ergast/f1';
const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (credentialJson) {
  initializeApp({ credential: cert(JSON.parse(credentialJson)) });
} else {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();
const now = Date.now();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function sessionInfo(session) {
  if (!session?.date) return null;
  const time = session.time || '00:00:00Z';
  const iso = `${session.date}T${time.endsWith('Z') || /[+-]\d\d:\d\d$/.test(time) ? time : `${time}Z`}`;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? { date: session.date, time, timestamp } : null;
}
function hasRows(data, keys) { return keys.some(key => Array.isArray(data[key]) && data[key].length > 0); }
async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Apex-F1-Tipp/1.0 (scheduled results sync)' } });
  if (response.status === 429) throw new Error(`HTTP 429 – API limit: ${url}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function main() {
  // Egyetlen naptárkérés futásonként; eredményvégpontot csak lejárt session után hívunk.
  const calendar = await fetchJson(`${API_BASE}/${SEASON}/races/?limit=100`);
  const races = calendar.MRData?.RaceTable?.Races || [];
  if (!races.length) throw new Error('Az API üres versenynaptárt adott vissza; a mentett adatokat változatlanul hagyjuk.');

  const events = [];
  for (const race of races) {
    const round = Number(race.round);
    const hasSprint = Boolean(race.Sprint?.date || race.SprintQualifying?.date);
    if (hasSprint) events.push({
      key: `${round}-sprint`, round, sprint: true, name: `${race.raceName} – Sprint`, raceName: race.raceName,
      circuitName: race.Circuit?.circuitName || '', country: race.Circuit?.Location?.country || '',
      date: race.Sprint?.date || race.date,
      qualifyingSession: sessionInfo(race.SprintQualifying),
      resultSession: sessionInfo(race.Sprint),
      qualifyingPath: 'sprintqualifying', resultsPath: 'sprint'
    });
    events.push({
      key: String(round), round, sprint: false, name: race.raceName, raceName: race.raceName,
      circuitName: race.Circuit?.circuitName || '', country: race.Circuit?.Location?.country || '', date: race.date,
      qualifyingSession: sessionInfo(race.Qualifying), resultSession: sessionInfo(race),
      qualifyingPath: 'qualifying', resultsPath: 'results'
    });
  }

  // Schedule mentése Firestore-ba. Ezt olvassa a kliens, nem az API-t.
  await db.doc(`officialSchedule/${SEASON}`).set({ season: SEASON, events, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  let fetched = 0, skipped = 0, failed = 0;
  for (const event of events) {
    const ref = db.doc(`officialResults/${event.key}`);
    const snap = await ref.get();
    const saved = snap.exists ? snap.data() : {};
    const patch = { season: SEASON, eventKey: event.key, round: event.round, sprint: event.sprint, name: event.name, updatedAt: FieldValue.serverTimestamp() };
    let changed = false;
    for (const kind of ['qualifying', 'results']) {
      const session = kind === 'qualifying' ? event.qualifyingSession : event.resultSession;
      const endpoint = kind === 'qualifying' ? event.qualifyingPath : event.resultsPath;
      if (!session || now < session.timestamp + 60 * 60 * 1000) { skipped++; continue; }
      const oldRows = saved[kind];
      if (Array.isArray(oldRows) && oldRows.length) { skipped++; continue; }
      try {
        const json = await fetchJson(`${API_BASE}/${SEASON}/${event.round}/${endpoint}/?limit=100`);
        const raceData = json.MRData?.RaceTable?.Races?.[0] || {};
        const rows = kind === 'qualifying'
          ? (raceData.QualifyingResults || raceData.SprintQualifyingResults || [])
          : (raceData.Results || raceData.SprintResults || []);
        if (rows.length) {
          patch[kind] = rows;
          patch[`${kind}FetchedAt`] = FieldValue.serverTimestamp();
          changed = true; fetched++;
          console.log(`OK ${event.name} / ${kind}: ${rows.length} rekord`);
        } else {
          patch[`${kind}LastAttemptAt`] = FieldValue.serverTimestamp();
          patch[`${kind}LastError`] = 'Az API még nem adott eredményrekordot; a következő ütemezett futás újrapróbálja.';
          changed = true; skipped++;
          console.log(`MÉG NINCS ${event.name} / ${kind}; később újrapróbáljuk`);
        }
      } catch (error) {
        patch[`${kind}LastAttemptAt`] = FieldValue.serverTimestamp();
        patch[`${kind}LastError`] = String(error.message || error).slice(0, 500);
        changed = true; failed++;
        console.error(`HIBA ${event.name} / ${kind}: ${error.message}`);
        // Kíméljük az API-t 429 vagy átmeneti hiba esetén.
        if (/429|5\d\d/.test(error.message)) await delay(5000);
      }
      // Ne indítsunk nagy párhuzamos kéréshullámot.
      await delay(1200);
    }
    if (changed) await ref.set(patch, { merge: true });
  }
  console.log(JSON.stringify({ season: SEASON, events: events.length, fetched, skipped, failed }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
