import { ensureSchema, hasDatabase, query, sendJson } from "./_db.js";
import { actualResultsFromEnv, scoreBracket } from "./_scoring.js";

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
      select id, display_name, champion, score, bracket, created_at, updated_at
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
