const STAGES = [
  { key: "round16", label: "Round of 16", max: 16 },
  { key: "quarterfinals", label: "Quarterfinals", max: 8 },
  { key: "semifinals", label: "Semifinals", max: 4 },
  { key: "final", label: "Final", max: 2 },
  { key: "champion", label: "Champion", max: 1 },
];

function normalizeTeam(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function uniqueTeams(values) {
  if (!Array.isArray(values)) return [];

  return [...new Set(values.map(normalizeTeam).filter(Boolean))];
}

export function actualResultsFromEnv() {
  const raw = process.env.ACTUAL_RESULTS || process.env.SCORE_ACTUAL_RESULTS;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid ACTUAL_RESULTS JSON", error);
    return null;
  }
}

export function scoreBracket(bracket, actualResults = actualResultsFromEnv()) {
  if (!actualResults) {
    return {
      score: 0,
      maxAvailable: 0,
      breakdown: [],
      scoringEnabled: false,
    };
  }

  const predicted = bracket?.rounds || {};
  const breakdown = [];
  let score = 0;
  let maxAvailable = 0;

  for (const stage of STAGES) {
    if (stage.key === "champion") {
      const actualChampion = normalizeTeam(actualResults.champion);
      const predictedChampion = normalizeTeam(
        predicted.champion || bracket?.champion,
      );

      if (!actualChampion) continue;

      const points = actualChampion === predictedChampion ? 1 : 0;
      score += points;
      maxAvailable += 1;
      breakdown.push({
        key: stage.key,
        label: stage.label,
        points,
        max: 1,
      });
      continue;
    }

    const actualTeams = uniqueTeams(actualResults[stage.key]);
    if (!actualTeams.length) continue;

    const predictedTeams = new Set(uniqueTeams(predicted[stage.key]));
    const points = actualTeams.filter((team) => predictedTeams.has(team)).length;
    const max = Math.min(stage.max, actualTeams.length);

    score += points;
    maxAvailable += max;
    breakdown.push({
      key: stage.key,
      label: stage.label,
      points,
      max,
    });
  }

  return {
    score,
    maxAvailable,
    breakdown,
    scoringEnabled: maxAvailable > 0,
  };
}

