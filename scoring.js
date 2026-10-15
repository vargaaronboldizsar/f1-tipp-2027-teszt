
/**
 * APEX F1 Tipp – pontösszesítő
 * A sprint, GP és szezonbónusz külön pontszámot kap.
 * Az összesített ranglista mindhármat összeadja.
 */

export function buildLeaderboard(
  users,
  eventScores,
  bonusScores,
  season = 2026
) {
  const rows = new Map();

  for (const user of users) {
    if (!user?.uid) continue;

    rows.set(user.uid, {
      uid: user.uid,
      displayName:
        user.displayName || user.username || 'Játékos',
      sprintPoints: 0,
      gpPoints: 0,
      bonusPoints: 0,
      totalPoints: 0,
      sprintEvents: 0,
      gpEvents: 0
    });
  }

  for (const score of eventScores) {
    const row = rows.get(score?.uid);
    if (!row) continue;

    const points = Number(score.points);
    if (!Number.isFinite(points)) continue;

    if (score.eventType === 'sprint') {
      row.sprintPoints += points;
      row.sprintEvents++;
    } else if (score.eventType === 'gp') {
      row.gpPoints += points;
      row.gpEvents++;
    }
  }

  for (const bonus of bonusScores) {
    if (Number(bonus.season) !== Number(season)) continue;

    const row = rows.get(bonus?.uid);
    if (!row) continue;

    const points = Number(bonus.points);
    if (Number.isFinite(points)) {
      row.bonusPoints += points;
    }
  }

  for (const row of rows.values()) {
    row.totalPoints =
      row.sprintPoints +
      row.gpPoints +
      row.bonusPoints;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.gpPoints - a.gpPoints ||
      a.displayName.localeCompare(b.displayName, 'hu')
  );
}

export function getPlayerSeasonStats(
  uid,
  eventScores,
  bonusScores,
  season = 2026
) {
  const events = eventScores.filter(
    score => score.uid === uid
  );

  const sprint = events.filter(
    score => score.eventType === 'sprint'
  );

  const gp = events.filter(
    score => score.eventType === 'gp'
  );

  const bonus = bonusScores.filter(
    score =>
      score.uid === uid &&
      Number(score.season) === Number(season)
  );

  const sum = items =>
    items.reduce((total, item) => {
      const points = Number(item.points);
      return total +
        (Number.isFinite(points) ? points : 0);
    }, 0);

  const sprintPoints = sum(sprint);
  const gpPoints = sum(gp);
  const bonusPoints = sum(bonus);

  return {
    sprintPoints,
    gpPoints,
    bonusPoints,
    totalPoints: sprintPoints + gpPoints + bonusPoints,
    sprintEvents: sprint.length,
    gpEvents: gp.length
  };
}


/**
 * Egy sprint vagy nagydíj pontjainak kiszámítása.
 *
 * tippek: [
 *   { uid, username, poleDriver, poleTime, winnerDriver }
 * ]
 *
 * eredmeny: {
 *   poleDriver, poleTime, winnerDriver
 * }
 *
 * A poleTime formátuma például: "1:32.456"
 */
export function calculateEventPoints(tippek, eredmeny) {
  if (!Array.isArray(tippek) || !eredmeny) {
    throw new Error("Hiányzó tippek vagy versenyeredmény.");
  }

  const parseTime = (value) => {
    const match = String(value || "")
      .trim()
      .match(/^(\d+):(\d{2})\.(\d{3})$/);

    if (!match) return null;

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const milliseconds = Number(match[3]);

    if (seconds >= 60) return null;

    return (minutes * 60 + seconds) * 1000 + milliseconds;
  };

  const actualTime = parseTime(eredmeny.poleTime);

  if (
    actualTime === null ||
    !eredmeny.poleDriver ||
    !eredmeny.winnerDriver
  ) {
    throw new Error("A hivatalos eredmény még nem teljes.");
  }

  const validTimes = tippek
    .map(tip => ({
      uid: tip.uid,
      time: parseTime(tip.poleTime)
    }))
    .filter(tip => tip.uid && tip.time !== null);

  const minimumDifference = validTimes.length
    ? Math.min(
        ...validTimes.map(tip => Math.abs(tip.time - actualTime))
      )
    : null;

  return tippek
    .filter(tip => tip.uid)
    .map(tip => {
      const guessedTime = parseTime(tip.poleTime);

      const poleTimePoints =
        guessedTime !== null &&
        minimumDifference !== null &&
        Math.abs(guessedTime - actualTime) === minimumDifference
          ? 1
          : 0;

      const poleDriverPoints =
        tip.poleDriver === eredmeny.poleDriver ? 1 : 0;

      const winnerPoints =
        tip.winnerDriver === eredmeny.winnerDriver ? 2 : 0;

      const bonusPoints =
        poleTimePoints === 1 &&
        poleDriverPoints === 1 &&
        winnerPoints === 2
          ? 1
          : 0;

      return {
        uid: tip.uid,
        username: tip.username || "Versenyző",
        poleTimePoints,
        poleDriverPoints,
        winnerPoints,
        bonusPoints,
        totalPoints:
          poleTimePoints +
          poleDriverPoints +
          winnerPoints +
          bonusPoints
      };
    });
}

