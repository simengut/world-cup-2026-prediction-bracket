import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const workbookPath = process.argv[2] || "Tipping VM 2026.xlsx";
const outputPath = process.argv[3] || "template-data.js";

const xlsxSource = fs.readFileSync("vendor/xlsx.full.min.js", "utf8");
const sandbox = {
  exports: {},
  module: { exports: {} },
  require,
  Buffer,
  Uint8Array,
  ArrayBuffer,
  console,
};
sandbox.global = sandbox;
vm.runInNewContext(xlsxSource, sandbox);
const XLSX = Object.keys(sandbox.exports).length
  ? sandbox.exports
  : sandbox.module.exports;

const workbook = XLSX.read(fs.readFileSync(workbookPath), {
  type: "buffer",
  cellDates: false,
  cellFormula: true,
});

function cellValue(sheetName, address) {
  const cell = workbook.Sheets[sheetName]?.[address];
  return cell ? (cell.v ?? cell.w) : undefined;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSeed(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = cleanText(value);
  if (/^\d+$/.test(text)) return Number(text);
  return text.toUpperCase();
}

function pickFromCell(value) {
  const pick = cleanText(value).toUpperCase();
  if (pick === "H") return "home";
  if (pick === "B") return "away";
  return "";
}

function buildGroups() {
  const groups = [];

  for (let groupIndex = 0; groupIndex < 12; groupIndex += 1) {
    const start = 4 + groupIndex * 4;
    const fallbackId = String.fromCharCode("A".charCodeAt(0) + groupIndex);
    const groupId = cleanText(cellValue("Grunnspill", `B${start}`)) || fallbackId;
    const teams = [];
    const seenRanks = new Set();
    let validRanks = true;

    for (let offset = 0; offset < 4; offset += 1) {
      const row = start + offset;
      const rank = Number(cellValue("Grunnspill", `E${row}`));
      if (!Number.isInteger(rank) || rank < 1 || rank > 4 || seenRanks.has(rank)) {
        validRanks = false;
      } else {
        seenRanks.add(rank);
      }

      teams.push({
        id: `${groupId}${offset + 1}`,
        name: cleanText(cellValue("Grunnspill", `D${row}`)),
        rank,
      });
    }

    if (!validRanks || seenRanks.size !== 4) {
      teams.forEach((team, index) => {
        team.rank = index + 1;
      });
    }

    const bestThird = teams.some((team, index) => {
      const row = start + index;
      return cleanText(cellValue("Grunnspill", `F${row}`)) === "1" && team.rank === 3;
    });

    groups.push({
      id: groupId,
      name: `Group ${groupId}`,
      bestThird,
      teams,
    });
  }

  return groups;
}

function buildAnnexRows() {
  const rows = [];

  for (let row = 4; row <= 498; row += 1) {
    const option = Number(cellValue("Annex", `A${row}`));
    const slots = ["B", "C", "D", "E", "F", "G", "H", "I"].map((col) =>
      cleanText(cellValue("Annex", `${col}${row}`)).toUpperCase(),
    );

    if (Number.isInteger(option) && slots.every((slot) => /^3[A-L]$/.test(slot))) {
      rows.push({ option, slots });
    }
  }

  if (rows.length !== 495) {
    throw new Error(`Expected 495 annex rows, found ${rows.length}.`);
  }

  return rows;
}

function buildRound(sheetName, startRow, endRow, thirdFor = {}) {
  return Array.from({ length: endRow - startRow + 1 }, (_, index) => {
    const row = startRow + index;
    const id = Number(cellValue(sheetName, `A${row}`));
    const match = {
      id,
      home: normalizeSeed(cellValue(sheetName, `B${row}`)),
    };

    if (thirdFor[id]) {
      match.thirdFor = thirdFor[id];
    } else {
      match.away = normalizeSeed(cellValue(sheetName, `C${row}`));
    }

    return match;
  });
}

function buildDefaultPicks() {
  const ranges = [
    ["16f", 2, 17],
    ["8f", 2, 9],
    ["4f", 2, 5],
    ["2f", 2, 3],
    ["Finale", 2, 2],
  ];
  const picks = {};

  ranges.forEach(([sheetName, startRow, endRow]) => {
    for (let row = startRow; row <= endRow; row += 1) {
      const id = Number(cellValue(sheetName, `A${row}`));
      const pick = pickFromCell(cellValue(sheetName, `F${row}`));
      if (Number.isInteger(id) && pick) picks[String(id)] = pick;
    }
  });

  return picks;
}

const data = {
  sourceFile: path.basename(workbookPath),
  annexHeaders: ["B", "C", "D", "E", "F", "G", "H", "I"].map((col) =>
    cleanText(cellValue("Annex", `${col}1`)),
  ),
  groups: buildGroups(),
  annexRows: buildAnnexRows(),
  rounds: {
    round32: buildRound("16f", 2, 17, {
      74: "1E",
      77: "1I",
      79: "1A",
      80: "1L",
      81: "1D",
      82: "1G",
      85: "1B",
      87: "1K",
    }),
    round16: buildRound("8f", 2, 9),
    quarterfinals: buildRound("4f", 2, 5),
    semifinals: buildRound("2f", 2, 3),
    final: buildRound("Finale", 2, 2),
  },
  defaultPicks: buildDefaultPicks(),
};

fs.writeFileSync(
  outputPath,
  `window.WC_TEMPLATE_DATA = ${JSON.stringify(data, null, 2)};\n`,
);

console.log(
  JSON.stringify(
    {
      outputPath,
      sourceFile: data.sourceFile,
      groups: data.groups.length,
      annexRows: data.annexRows.length,
      defaultPicks: Object.keys(data.defaultPicks).length,
    },
    null,
    2,
  ),
);
