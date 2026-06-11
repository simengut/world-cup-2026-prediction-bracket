import crypto from "node:crypto";
import { ensureSchema, hasDatabase, query, sendJson } from "./_db.js";
import { cleanDisplayName, readJsonBody } from "./_request.js";
import { scoreBracket } from "./_scoring.js";

const MAX_BRACKET_BYTES = 150_000;
const REQUIRED_MATCH_IDS = [
  "73",
  "74",
  "75",
  "76",
  "77",
  "78",
  "79",
  "80",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
  "100",
  "101",
  "102",
  "104",
];
const VALID_PICK_VALUES = new Set(["home", "away"]);

function validateBracket(bracket) {
  if (!bracket || typeof bracket !== "object") {
    return "Bracket payload is missing.";
  }

  if (!Array.isArray(bracket.groups) || bracket.groups.length !== 12) {
    return "Bracket must include 12 groups.";
  }

  if (!bracket.picks || typeof bracket.picks !== "object") {
    return "Bracket must include knockout picks.";
  }

  const selectedThirds = bracket.groups.filter(
    (group) => group?.bestThird,
  ).length;
  if (selectedThirds !== 8) {
    return "Bracket must include exactly eight best third-place teams.";
  }

  const missingMatch = REQUIRED_MATCH_IDS.find(
    (matchId) => !VALID_PICK_VALUES.has(bracket.picks[matchId]),
  );
  if (missingMatch) {
    return `Complete every knockout pick before submitting. Missing match ${missingMatch}.`;
  }

  if (!String(bracket.champion || "").trim()) {
    return "Bracket must include a champion.";
  }

  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!hasDatabase()) {
    return sendJson(res, 503, {
      error: "Database not configured",
      message: "Connect Neon and set DATABASE_URL to enable submissions.",
    });
  }

  try {
    const body = await readJsonBody(req);
    const displayName = cleanDisplayName(body.displayName);
    const bracket = body.bracket;
    const champion = String(body.champion || "").trim().slice(0, 80);
    const bracketJson = JSON.stringify(bracket);

    if (!displayName) {
      return sendJson(res, 400, { error: "Name is required." });
    }

    const bracketError = validateBracket(bracket);
    if (bracketError) {
      return sendJson(res, 400, { error: bracketError });
    }

    if (Buffer.byteLength(bracketJson, "utf8") > MAX_BRACKET_BYTES) {
      return sendJson(res, 413, { error: "Bracket payload is too large." });
    }

    await ensureSchema();

    const id = crypto.randomUUID();
    const score = scoreBracket(bracket).score;
    const [submission] = await query`
      insert into submissions (id, display_name, champion, bracket, score)
      values (${id}, ${displayName}, ${champion || null}, ${bracketJson}::jsonb, ${score})
      returning id, display_name, champion, score, created_at, updated_at
    `;

    return sendJson(res, 201, { submission });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Failed to submit picks" });
  }
}
