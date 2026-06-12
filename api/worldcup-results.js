import { sendJson } from "./_db.js";

const FOOTBALL_DATA_URL =
  "https://api.football-data.org/v4/competitions/WC/matches?season=2026";

function rateLimitHeaders(response) {
  const headers = {};
  for (const key of [
    "x-requests-available",
    "x-requestcounter-reset",
    "x-api-version",
    "retry-after",
  ]) {
    const value = response.headers.get(key);
    if (value) headers[key] = value;
  }
  return headers;
}

function matchScore(match) {
  const score = match?.score?.fullTime || {};
  const home = Number(score.home);
  const away = Number(score.away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "";
  return `${home} - ${away}`;
}

function publicMatch(match) {
  return {
    utcDate: match.utcDate,
    status: match.status,
    stage: match.stage,
    group: match.group,
    homeTeam: match.homeTeam?.name || "",
    awayTeam: match.awayTeam?.name || "",
    score: matchScore(match),
    lastUpdated: match.lastUpdated || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    return sendJson(res, 503, {
      error: "Football-data token is not configured",
    });
  }

  try {
    const response = await fetch(FOOTBALL_DATA_URL, {
      headers: { "X-Auth-Token": token },
    });
    const payload = await response.json().catch(() => ({}));
    const limits = rateLimitHeaders(response);

    Object.entries(limits).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!response.ok) {
      return sendJson(res, response.status, {
        error: payload.message || payload.error || "Football-data request failed",
        rateLimit: limits,
      });
    }

    const matches = Array.isArray(payload.matches)
      ? payload.matches.map(publicMatch).filter((match) => match.homeTeam && match.awayTeam)
      : [];

    res.setHeader("cache-control", "s-maxage=900, stale-while-revalidate=3600");
    return sendJson(res, 200, {
      matches,
      rateLimit: limits,
      source: "football-data.org",
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Failed to load World Cup results" });
  }
}
