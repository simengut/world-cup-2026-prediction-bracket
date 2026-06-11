import { ensureSchema, hasDatabase, query, sendJson } from "./_db.js";
import { actualResultsFromEnv, scoreBracket } from "./_scoring.js";

function publicBracket(bracket) {
  if (!bracket || typeof bracket !== "object") return null;

  return {
    groups: Array.isArray(bracket.groups)
      ? bracket.groups.map((group) => ({
          id: group.id,
          bestThird: Boolean(group.bestThird),
          teams: Array.isArray(group.teams)
            ? group.teams.map((team) => ({
                id: team.id,
                name: team.name,
                rank: team.rank,
              }))
            : [],
        }))
      : [],
    picks:
      bracket.picks && typeof bracket.picks === "object" ? bracket.picks : {},
    bestThirdMap: bracket.bestThirdMap || null,
    champion: bracket.champion || null,
    rounds:
      bracket.rounds && typeof bracket.rounds === "object"
        ? bracket.rounds
        : {},
    submittedAt: bracket.submittedAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!hasDatabase()) {
    return sendJson(res, 503, {
      error: "Database not configured",
      message: "Connect Neon and set DATABASE_URL to enable the leaderboard.",
    });
  }

  try {
    await ensureSchema();
    const rows = await query`
      select id, display_name, champion, is_public, score, bracket, created_at, updated_at
      from submissions
      order by created_at asc
    `;
    const actualResults = actualResultsFromEnv();
    const entries = rows
      .map((row) => {
        const scored = scoreBracket(row.bracket, actualResults);
        return {
          id: row.id,
          display_name: row.display_name,
          champion: row.champion,
          is_public: Boolean(row.is_public),
          bracket: row.is_public ? publicBracket(row.bracket) : null,
          score: scored.score,
          max_score: scored.maxAvailable,
          breakdown: scored.breakdown,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .slice(0, 100);

    const scoring = scoreBracket({}, actualResults);
    return sendJson(res, 200, { entries, scoring });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Failed to load leaderboard" });
  }
}
