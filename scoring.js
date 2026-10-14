
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
