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
    return "Sluttspilldata mangler.";
  }

  if (!Array.isArray(bracket.groups) || bracket.groups.length !== 12) {
    return "Sluttspillet må inneholde 12 grupper.";
  }

  if (!bracket.picks || typeof bracket.picks !== "object") {
    return "Sluttspillet må inneholde sluttspilltips.";
  }

  const selectedThirds = bracket.groups.filter(
    (group) => group?.bestThird,
  ).length;
  if (selectedThirds !== 8) {
    return "Sluttspillet må ha nøyaktig åtte beste tredjeplasser.";
  }

  const missingMatch = REQUIRED_MATCH_IDS.find(
    (matchId) => !VALID_PICK_VALUES.has(bracket.picks[matchId]),
  );
  if (missingMatch) {
    return `Fullfør alle sluttspilltips før innsending. Mangler kamp ${missingMatch}.`;
  }

  if (!String(bracket.champion || "").trim()) {
    return "Sluttspillet må ha en vinner.";
  }

  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return sendJson(res, 405, { error: "Metoden er ikke tillatt" });
  }

  if (!hasDatabase()) {
    return sendJson(res, 503, {
      error: "Database er ikke konfigurert",
      message: "Koble til Neon og sett DATABASE_URL for å aktivere innsendinger.",
    });
  }

  try {
    const body = await readJsonBody(req);
    const displayName = cleanDisplayName(body.displayName);
    const bracket = body.bracket;
    const champion = String(body.champion || "").trim().slice(0, 80);
    const bracketJson = JSON.stringify(bracket);

    if (!displayName) {
      return sendJson(res, 400, { error: "Navn er påkrevd." });
    }

    const bracketError = validateBracket(bracket);
    if (bracketError) {
      return sendJson(res, 400, { error: bracketError });
    }

    if (Buffer.byteLength(bracketJson, "utf8") > MAX_BRACKET_BYTES) {
      return sendJson(res, 413, { error: "Sluttspilldataene er for store." });
    }

    await ensureSchema();

    const id = crypto.randomUUID();
    const score = scoreBracket(bracket).score;
    const [submission] = await query`
      insert into submissions (id, display_name, champion, bracket, is_public, score)
      values (${id}, ${displayName}, ${champion || null}, ${bracketJson}::jsonb, true, ${score})
      returning id, display_name, champion, is_public, score, created_at, updated_at
    `;

    return sendJson(res, 201, { submission });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Kunne ikke sende inn tips" });
  }
}
