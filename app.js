(function () {
  const DATA = window.WC_TEMPLATE_DATA;
  const ROUND_META = [
    { key: "round32", label: "Round of 32" },
    { key: "round16", label: "Round of 16" },
    { key: "quarterfinals", label: "Quarterfinals" },
    { key: "semifinals", label: "Semifinals" },
    { key: "final", label: "Final" },
  ];
  const PUBLIC_ROUND_LABELS = {
    round16: "Round of 16",
    quarterfinals: "Quarterfinals",
    semifinals: "Semifinals",
    final: "Finalists",
  };
  const REQUIRED_MATCH_IDS = Object.values(DATA.rounds)
    .flat()
    .map((match) => String(match.id));
  const REQUIRED_MATCH_ID_SET = new Set(REQUIRED_MATCH_IDS);
  const TOTAL_KNOCKOUT_PICKS = 31;
  const FLAG_BASE = "vendor/flags";
  const STORAGE_KEY = "wc2026-prediction-draft";
  const STORAGE_VERSION = 1;
  const FLAG_CODES = {
    "Algerie": "dz",
    "Argentina": "ar",
    "Australia": "au",
    "Belgia": "be",
    "Bosnia-Hercegovina": "ba",
    "Brasil": "br",
    "Canada": "ca",
    "Colombia": "co",
    "Curaçao": "cw",
    "DR Kongo": "cd",
    "Ecuador": "ec",
    "Egypt": "eg",
    "Elfenbenskysten": "ci",
    "England": "gb-eng",
    "Frankrike": "fr",
    "Ghana": "gh",
    "Haiti": "ht",
    "Iran": "ir",
    "Irak": "iq",
    "Japan": "jp",
    "Jordan": "jo",
    "Kapp Verde": "cv",
    "Kroatia": "hr",
    "Marokko": "ma",
    "Mexico": "mx",
    "Nederland": "nl",
    "New Zealand": "nz",
    "Norge": "no",
    "Panama": "pa",
    "Paraguay": "py",
    "Portugal": "pt",
    "Qatar": "qa",
    "Saudi-Arabia": "sa",
    "Senegal": "sn",
    "Skottland": "gb-sct",
    "Spania": "es",
    "Sveits": "ch",
    "Sverige": "se",
    "Sør-Afrika": "za",
    "Sør-Korea": "kr",
    "Tsjekkia": "cz",
    "Tunisia": "tn",
    "Tyrkia": "tr",
    "Tyskland": "de",
    "USA": "us",
    "Uruguay": "uy",
    "Usbekistan": "uz",
    "Østerrike": "at",
  };

  const state = {
    groups: clone(DATA.groups),
    annexRows: clone(DATA.annexRows),
    picks: { ...DATA.defaultPicks },
    activeView: "bracket",
    importName: DATA.sourceFile,
    importStatus: "Workbook",
    leaderboard: [],
    leaderboardStatus: "Loading leaderboard",
    submitting: false,
  };

  const els = {
    headerMeta: document.querySelector("#headerMeta"),
    importBadge: document.querySelector("#importBadge"),
    metricsGrid: document.querySelector("#metricsGrid"),
    thirdCounter: document.querySelector("#thirdCounter"),
    thirdList: document.querySelector("#thirdList"),
    groupsGrid: document.querySelector("#groupsGrid"),
    bracketBoard: document.querySelector("#bracketBoard"),
    championStrip: document.querySelector("#championStrip"),
    inlineStatus: document.querySelector("#inlineStatus"),
    toast: document.querySelector("#toast"),
    excelInput: document.querySelector("#excelInput"),
    resetButton: document.querySelector("#resetButton"),
    clearKnockoutButton: document.querySelector("#clearKnockoutButton"),
    exportButton: document.querySelector("#exportButton"),
    submitForm: document.querySelector("#submitForm"),
    displayNameInput: document.querySelector("#displayNameInput"),
    submitPicksButton: document.querySelector("#submitPicksButton"),
    submitStatus: document.querySelector("#submitStatus"),
    leaderboardList: document.querySelector("#leaderboardList"),
    refreshLeaderboardButton: document.querySelector("#refreshLeaderboardButton"),
    pickModal: document.querySelector("#pickModal"),
    pickModalTitle: document.querySelector("#pickModalTitle"),
    pickModalBody: document.querySelector("#pickModalBody"),
    closePickModalButton: document.querySelector("#closePickModalButton"),
    submitConfirmModal: document.querySelector("#submitConfirmModal"),
    cancelSubmitConfirmButton: document.querySelector("#cancelSubmitConfirmButton"),
    confirmSubmitButton: document.querySelector("#confirmSubmitButton"),
    viewButtons: Array.from(document.querySelectorAll("[data-view]")),
    groupsView: document.querySelector("#groupsView"),
    bracketView: document.querySelector("#bracketView"),
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function flagCodeFor(teamName) {
    return FLAG_CODES[String(teamName || "").trim()] || "";
  }

  function flagMarkup(teamName) {
    const code = flagCodeFor(teamName);
    if (!code) return '<span class="flag-placeholder" aria-hidden="true"></span>';

    return `
      <img
        class="team-flag"
        src="${FLAG_BASE}/${escapeHtml(code)}.svg"
        alt=""
        referrerpolicy="no-referrer"
      />
    `;
  }

  function normalizeStoredGroups(groups) {
    if (!Array.isArray(groups) || groups.length !== DATA.groups.length) {
      return null;
    }

    const templateIds = new Set(DATA.groups.map((group) => group.id));
    const normalized = groups.map((group) => {
      const id = String(group?.id || "").trim().toUpperCase();
      if (!templateIds.has(id) || !Array.isArray(group.teams)) return null;

      const teams = group.teams.map((team, index) => ({
        id: String(team?.id || `${id}${index + 1}`).slice(0, 24),
        name: String(team?.name || "").trim().slice(0, 80),
        rank: Number(team?.rank),
      }));
      const ranks = teams.map((team) => team.rank);
      const validRanks =
        teams.length === 4 &&
        ranks.every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= 4) &&
        new Set(ranks).size === 4 &&
        teams.every((team) => team.name);

      if (!validRanks) return null;

      return {
        id,
        name: String(group.name || `Group ${id}`).slice(0, 40),
        bestThird: Boolean(group.bestThird),
        teams,
      };
    });

    if (normalized.some((group) => !group)) return null;
    if (new Set(normalized.map((group) => group.id)).size !== DATA.groups.length) {
      return null;
    }

    return normalized;
  }

  function normalizeStoredPicks(picks) {
    if (!picks || typeof picks !== "object" || Array.isArray(picks)) return null;

    return Object.fromEntries(
      Object.entries(picks).filter(
        ([matchId, pick]) =>
          REQUIRED_MATCH_ID_SET.has(String(matchId)) &&
          (pick === "home" || pick === "away"),
      ),
    );
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: STORAGE_VERSION,
          savedAt: new Date().toISOString(),
          groups: state.groups,
          picks: state.picks,
          importName: state.importName,
          importStatus: state.importStatus,
          activeView: state.activeView,
          displayName: els.displayNameInput.value,
        }),
      );
    } catch (error) {
      console.warn("Draft save failed", error);
    }
  }

  function restoreDraft() {
    try {
      const rawDraft = localStorage.getItem(STORAGE_KEY);
      if (!rawDraft) return false;

      const draft = JSON.parse(rawDraft);
      if (draft?.version !== STORAGE_VERSION) return false;

      const groups = normalizeStoredGroups(draft.groups);
      const picks = normalizeStoredPicks(draft.picks);
      if (!groups || !picks) return false;

      state.groups = groups;
      state.picks = picks;
      state.importName = String(draft.importName || DATA.sourceFile).slice(0, 100);
      state.importStatus = String(draft.importStatus || "Saved draft").slice(0, 40);
      state.activeView = draft.activeView === "groups" ? "groups" : "bracket";
      els.displayNameInput.value = String(draft.displayName || "").slice(0, 60);
      return true;
    } catch (error) {
      console.warn("Draft restore failed", error);
      return false;
    }
  }

  function teamMarkup(teamName) {
    return `
      <span class="team-label">
        ${flagMarkup(teamName)}
        <span class="team-name">${escapeHtml(teamName)}</span>
      </span>
    `;
  }

  function groupById(groupId) {
    return state.groups.find((group) => group.id === groupId);
  }

  function sortedTeams(group) {
    return [...group.teams].sort((a, b) => a.rank - b.rank);
  }

  function thirdTeam(group) {
    return sortedTeams(group)[2];
  }

  function selectedThirdCodes() {
    return state.groups
      .filter((group) => group.bestThird)
      .map((group) => `3${group.id}`)
      .sort();
  }

  function sourceMatchIds(match) {
    return [match.homeSeed, match.awaySeed].filter((seed) =>
      Number.isInteger(seed),
    );
  }

  function sortMatchesByIds(matches, ids) {
    const order = new Map(ids.map((id, index) => [String(id), index]));

    return [...matches].sort((a, b) => {
      const aOrder = order.has(String(a.id))
        ? order.get(String(a.id))
        : Number.MAX_SAFE_INTEGER;
      const bOrder = order.has(String(b.id))
        ? order.get(String(b.id))
        : Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.id - b.id;
    });
  }

  function displayRounds(bracket) {
    const ordered = {};
    const finalRound = ROUND_META[ROUND_META.length - 1].key;
    ordered[finalRound] = [...bracket.rounds[finalRound]];

    for (let index = ROUND_META.length - 1; index > 0; index -= 1) {
      const currentKey = ROUND_META[index].key;
      const previousKey = ROUND_META[index - 1].key;
      const sourceIds = ordered[currentKey].flatMap(sourceMatchIds);
      ordered[previousKey] = sortMatchesByIds(
        bracket.rounds[previousKey],
        sourceIds,
      );
    }

    return ordered;
  }

  function completedPickCount() {
    return REQUIRED_MATCH_IDS.filter(
      (id) => state.picks[id] === "home" || state.picks[id] === "away",
    ).length;
  }

  function submissionReadiness() {
    const selectedThirds = selectedThirdCodes().length;
    const pickCount = completedPickCount();
    const displayName = els.displayNameInput.value.trim();

    if (state.submitting) {
      return { ready: false, message: "Submitting..." };
    }

    if (selectedThirds !== 8) {
      return {
        ready: false,
        message:
          selectedThirds < 8
            ? `Select ${8 - selectedThirds} more best thirds`
            : `Remove ${selectedThirds - 8} best thirds`,
      };
    }

    if (pickCount !== TOTAL_KNOCKOUT_PICKS) {
      return {
        ready: false,
        message: `Choose ${TOTAL_KNOCKOUT_PICKS - pickCount} more knockout ${
          TOTAL_KNOCKOUT_PICKS - pickCount === 1 ? "game" : "games"
        }`,
      };
    }

    if (!displayName) {
      return { ready: false, message: "Enter your name to submit" };
    }

    if (!backendAvailableHere()) {
      return { ready: false, message: "Submit from the deployed Vercel site" };
    }

    return { ready: true, message: "Ready to submit" };
  }

  function updateSubmitState() {
    const readiness = submissionReadiness();
    els.submitPicksButton.disabled = !readiness.ready;
    els.submitPicksButton.setAttribute(
      "aria-disabled",
      readiness.ready ? "false" : "true",
    );
    els.submitStatus.textContent = readiness.message;
  }

  function thirdAssignment() {
    const codes = selectedThirdCodes();
    const selected = new Set(codes);
    if (selected.size !== 8) {
      return {
        map: {},
        row: null,
        message:
          selected.size < 8
            ? `${8 - selected.size} more best thirds needed`
            : `${selected.size - 8} too many best thirds`,
      };
    }

    const row = state.annexRows.find(
      (candidate) =>
        candidate.slots.length === 8 &&
        candidate.slots.every((slot) => selected.has(slot)),
    );

    if (!row) {
      return { map: {}, row: null, message: "No third-place map found" };
    }

    const map = {};
    DATA.annexHeaders.forEach((header, index) => {
      map[header] = row.slots[index];
    });

    return { map, row, message: `Annex option ${row.option}` };
  }

  function entrantFromSeed(seed, matchesById) {
    if (seed === null || seed === undefined) return null;

    if (typeof seed === "number") {
      return matchesById[String(seed)]?.winner || null;
    }

    const seedText = String(seed);
    const rank = Number(seedText.charAt(0));
    const groupId = seedText.slice(1);
    const group = groupById(groupId);
    const team = group?.teams.find((candidate) => candidate.rank === rank);

    if (!team) return null;
    if (rank === 3 && !group.bestThird) return null;

    return {
      id: team.id,
      name: team.name,
      flagCode: flagCodeFor(team.name),
      seed: seedText,
      groupId,
      rank,
    };
  }

  function seedLabel(seed) {
    if (seed === null || seed === undefined) return "Best 3rd";
    return typeof seed === "number" ? `W${seed}` : seed;
  }

  function buildBracket() {
    const assignment = thirdAssignment();
    const matchesById = {};
    const rounds = {};

    ROUND_META.forEach((round) => {
      rounds[round.key] = DATA.rounds[round.key].map((template) => {
        const awaySeed = template.thirdFor
          ? assignment.map[template.thirdFor] || null
          : template.away;
        const home = entrantFromSeed(template.home, matchesById);
        const away = entrantFromSeed(awaySeed, matchesById);
        const pick = state.picks[String(template.id)];
        const winner =
          pick === "home" ? home : pick === "away" ? away : null;
        const match = {
          id: template.id,
          homeSeed: template.home,
          awaySeed,
          home,
          away,
          pick,
          winner,
        };
        matchesById[String(template.id)] = match;
        return match;
      });
    });

    return { assignment, matchesById, rounds };
  }

  function moveTeam(groupId, teamId, direction) {
    const group = groupById(groupId);
    const team = group?.teams.find((candidate) => candidate.id === teamId);
    if (!group || !team) return;

    const nextRank = team.rank + direction;
    if (nextRank < 1 || nextRank > 4) return;

    const swap = group.teams.find((candidate) => candidate.rank === nextRank);
    if (swap) swap.rank = team.rank;
    team.rank = nextRank;
    render();
  }

  function toggleBestThird(groupId) {
    const group = groupById(groupId);
    if (!group) return;
    const selectedCount = selectedThirdCodes().length;

    if (!group.bestThird && selectedCount >= 8) {
      showToast("Eight best third-place teams are already selected.");
      return;
    }

    group.bestThird = !group.bestThird;
    render();
  }

  function setMatchPick(matchId, side) {
    const key = String(matchId);
    if (state.picks[key] === side) {
      delete state.picks[key];
    } else {
      state.picks[key] = side;
    }
    render();
  }

  function renderMetrics(bracket) {
    const selectedThirds = selectedThirdCodes().length;
    const pickCount = completedPickCount();
    const finalMatch = bracket.matchesById["104"];
    const champion = finalMatch?.winner?.name || "Open";
    const metrics = [
      ["Groups", "12 / 12", "Seeded"],
      ["Best thirds", `${selectedThirds} / 8`, bracket.assignment.message],
      ["Knockout", `${pickCount} / ${TOTAL_KNOCKOUT_PICKS}`, "Picks"],
      ["Champion", champion, "Projected"],
    ];

    els.metricsGrid.innerHTML = metrics
      .map(
        ([label, value, detail]) => `
          <div class="metric-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        `,
      )
      .join("");
  }

  function renderThirdList() {
    const selected = state.groups.filter((group) => group.bestThird);
    els.thirdCounter.textContent = `${selected.length} / 8`;

    if (!selected.length) {
      els.thirdList.innerHTML = '<div class="empty-state">None selected</div>';
      return;
    }

    els.thirdList.innerHTML = selected
      .map((group) => {
        const team = thirdTeam(group);
        return `
          <div class="third-item">
            <span class="seed-token">3${escapeHtml(group.id)}</span>
            ${teamMarkup(team.name)}
          </div>
        `;
      })
      .join("");
  }

  function renderLeaderboard() {
    if (!state.leaderboard.length) {
      els.leaderboardList.innerHTML = `<div class="empty-state">${escapeHtml(state.leaderboardStatus)}</div>`;
      return;
    }

    els.leaderboardList.innerHTML = state.leaderboard
      .map((entry, index) => {
        const champion = entry.champion || "Open";
        const scoreLabel = entry.max_score
          ? `${Number(entry.score || 0)} / ${Number(entry.max_score)}`
          : Number(entry.score || 0);
        const canView = Boolean(entry.bracket);
        return `
          <div class="leaderboard-row">
            <span class="rank-badge">${index + 1}</span>
            <div class="leaderboard-main">
              <strong>${escapeHtml(entry.display_name)}</strong>
              <span>${teamMarkup(champion)}</span>
            </div>
            <div class="leaderboard-actions">
              <span class="score-pill">${escapeHtml(scoreLabel)}</span>
              ${
                canView
                  ? `<button class="mini-button" type="button" data-action="view-public-picks" data-entry-id="${escapeHtml(entry.id)}">View</button>`
                  : '<span class="unavailable-pill">No picks</span>'
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function formatDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Submitted";

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function publicGroupTeams(group) {
    return Array.isArray(group?.teams)
      ? [...group.teams].sort((a, b) => Number(a.rank) - Number(b.rank))
      : [];
  }

  function renderPublicBestThirds(groups) {
    const selected = groups
      .filter((group) => group.bestThird)
      .map((group) => ({
        groupId: group.id,
        team: publicGroupTeams(group).find((team) => Number(team.rank) === 3),
      }))
      .filter((item) => item.team);

    if (!selected.length) {
      return '<div class="empty-state">No best thirds saved</div>';
    }

    return `
      <div class="public-chip-grid">
        ${selected
          .map(
            (item) => `
              <div class="public-chip">
                <span class="seed-token">3${escapeHtml(item.groupId)}</span>
                ${teamMarkup(item.team.name)}
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderPublicGroups(groups) {
    if (!groups.length) {
      return '<div class="empty-state">No group picks saved</div>';
    }

    return `
      <div class="public-groups-grid">
        ${groups
          .map(
            (group) => `
              <div class="public-group">
                <h3>Group ${escapeHtml(group.id)}</h3>
                ${publicGroupTeams(group)
                  .map(
                    (team) => `
                      <div class="public-team">
                        <span class="rank-badge rank-${escapeHtml(team.rank)}">${escapeHtml(team.rank)}</span>
                        ${teamMarkup(team.name)}
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderPublicRounds(rounds) {
    const keys = ["round16", "quarterfinals", "semifinals", "final"];
    const cards = keys
      .map((key) => {
        const teams = Array.isArray(rounds?.[key]) ? rounds[key] : [];
        return `
          <div class="public-round">
            <h3>${escapeHtml(PUBLIC_ROUND_LABELS[key])}</h3>
            ${
              teams.length
                ? teams
                    .map(
                      (team) => `
                        <div class="public-chip">${teamMarkup(team)}</div>
                      `,
                    )
                    .join("")
                : '<div class="empty-state">No picks saved</div>'
            }
          </div>
        `;
      })
      .join("");

    return `<div class="public-rounds-grid">${cards}</div>`;
  }

  function openPublicPicks(entryId) {
    const entry = state.leaderboard.find(
      (candidate) => String(candidate.id) === String(entryId),
    );

    if (!entry?.bracket) {
      showToast("Picks are not available for that submission.");
      return;
    }

    const groups = Array.isArray(entry.bracket.groups)
      ? entry.bracket.groups
      : [];
    const champion =
      entry.bracket.champion || entry.champion || entry.bracket.rounds?.champion;
    const submittedAt = entry.bracket.submittedAt || entry.created_at;

    els.pickModalTitle.textContent = `${entry.display_name}'s bracket`;
    els.pickModalBody.innerHTML = `
      <div class="public-pick-summary">
        <div>
          <span>Champion</span>
          <strong>${teamMarkup(champion || "Open")}</strong>
        </div>
        <div>
          <span>Score</span>
          <strong>${Number(entry.score || 0)} / ${Number(entry.max_score || 0)}</strong>
        </div>
        <div>
          <span>Submitted</span>
          <strong>${escapeHtml(formatDateLabel(submittedAt))}</strong>
        </div>
      </div>

      <section class="public-pick-section">
        <h3>Knockout Progression</h3>
        ${renderPublicRounds(entry.bracket.rounds)}
      </section>

      <section class="public-pick-section">
        <h3>Best Thirds</h3>
        ${renderPublicBestThirds(groups)}
      </section>

      <section class="public-pick-section">
        <h3>Group Picks</h3>
        ${renderPublicGroups(groups)}
      </section>
    `;
    els.pickModal.hidden = false;
    els.closePickModalButton.focus();
  }

  function closePublicPicks() {
    els.pickModal.hidden = true;
  }

  let submitConfirmResolve = null;

  function confirmPublicSubmission() {
    return new Promise((resolve) => {
      submitConfirmResolve = resolve;
      els.submitConfirmModal.hidden = false;
      els.confirmSubmitButton.focus();
    });
  }

  function resolveSubmitConfirmation(confirmed) {
    if (!submitConfirmResolve) return;
    els.submitConfirmModal.hidden = true;
    const resolve = submitConfirmResolve;
    submitConfirmResolve = null;
    resolve(confirmed);
  }

  function renderGroups() {
    const selectedCount = selectedThirdCodes().length;
    els.groupsGrid.innerHTML = state.groups
      .map((group) => {
        const teams = sortedTeams(group);
        const third = thirdTeam(group);
        const bestDisabled = !group.bestThird && selectedCount >= 8;

        return `
          <article class="group-card" data-group-id="${escapeHtml(group.id)}">
            <div class="group-head">
              <div>
                <span class="group-kicker">Group</span>
                <h3>${escapeHtml(group.id)}</h3>
              </div>
              <button
                class="best-third-toggle ${group.bestThird ? "selected" : ""}"
                type="button"
                data-action="toggle-third"
                data-group-id="${escapeHtml(group.id)}"
                ${bestDisabled ? "disabled" : ""}
                aria-pressed="${group.bestThird ? "true" : "false"}"
              >
                3rd
              </button>
            </div>
            <div class="team-list">
              ${teams
                .map(
                  (team) => `
                    <div class="team-row ${team.rank === 3 && group.bestThird ? "best-third" : ""}">
                      <span class="rank-badge rank-${team.rank}">${team.rank}</span>
                      ${teamMarkup(team.name)}
                      <div class="rank-actions">
                        <button
                          class="icon-button"
                          type="button"
                          data-action="move-up"
                          data-group-id="${escapeHtml(group.id)}"
                          data-team-id="${escapeHtml(team.id)}"
                          ${team.rank === 1 ? "disabled" : ""}
                          aria-label="Move ${escapeHtml(team.name)} up"
                        >
                          ↑
                        </button>
                        <button
                          class="icon-button"
                          type="button"
                          data-action="move-down"
                          data-group-id="${escapeHtml(group.id)}"
                          data-team-id="${escapeHtml(team.id)}"
                          ${team.rank === 4 ? "disabled" : ""}
                          aria-label="Move ${escapeHtml(team.name)} down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
            <div class="group-foot">
              <span>3${escapeHtml(group.id)}</span>
              <strong>${teamMarkup(third.name)}</strong>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderChampion(bracket) {
    const finalMatch = bracket.matchesById["104"];
    const champion = finalMatch?.winner;
    const finalistA = finalMatch?.home?.name || "Finalist";
    const finalistB = finalMatch?.away?.name || "Finalist";

    els.championStrip.innerHTML = `
      <div class="champion-copy">
        <span>Projected champion</span>
        <strong>${escapeHtml(champion?.name || "Open bracket")}</strong>
      </div>
      <div class="finalists">
        <span>${teamMarkup(finalistA)}</span>
        <span>${teamMarkup(finalistB)}</span>
      </div>
    `;
  }

  function renderEntrant(match, side) {
    const entrant = match[side];
    const picked = match.pick === side;
    const seed = side === "home" ? match.homeSeed : match.awaySeed;
    const disabled = !entrant;
    const label = entrant ? entrant.name : "Waiting";

    return `
      <button
        class="entrant ${picked ? "picked" : ""}"
        type="button"
        data-action="pick-match"
        data-match-id="${match.id}"
        data-side="${side}"
        ${disabled ? "disabled" : ""}
      >
        <span class="seed-token">${escapeHtml(seedLabel(seed))}</span>
        <span class="entrant-name">${teamMarkup(label)}</span>
      </button>
    `;
  }

  function renderConnectors(rounds) {
    els.bracketBoard.querySelector(".bracket-connectors")?.remove();
    if (els.bracketView.hidden) return;

    const boardBox = els.bracketBoard.getBoundingClientRect();
    const paths = [];

    ROUND_META.slice(1).forEach((round) => {
      rounds[round.key].forEach((match) => {
        const [firstSourceId, secondSourceId] = sourceMatchIds(match);
        if (firstSourceId === undefined || secondSourceId === undefined) return;

        const sourceCards = [firstSourceId, secondSourceId].map((id) =>
          els.bracketBoard.querySelector(`[data-match-id="${id}"]`),
        );
        const targetCard = els.bracketBoard.querySelector(
          `[data-match-id="${match.id}"]`,
        );
        if (!sourceCards[0] || !sourceCards[1] || !targetCard) return;

        const sourcePoints = sourceCards.map((card) => {
          const box = card.getBoundingClientRect();
          return {
            x: box.right - boardBox.left + els.bracketBoard.scrollLeft,
            y:
              box.top -
              boardBox.top +
              els.bracketBoard.scrollTop +
              box.height / 2,
          };
        });
        const targetBox = targetCard.getBoundingClientRect();
        const targetPoint = {
          x: targetBox.left - boardBox.left + els.bracketBoard.scrollLeft,
          y:
            targetBox.top -
            boardBox.top +
            els.bracketBoard.scrollTop +
            targetBox.height / 2,
        };
        const elbowX =
          sourcePoints[0].x + (targetPoint.x - sourcePoints[0].x) / 2;
        const topY = Math.min(sourcePoints[0].y, sourcePoints[1].y);
        const bottomY = Math.max(sourcePoints[0].y, sourcePoints[1].y);

        paths.push(
          [
            `M ${sourcePoints[0].x} ${sourcePoints[0].y} H ${elbowX}`,
            `M ${sourcePoints[1].x} ${sourcePoints[1].y} H ${elbowX}`,
            `M ${elbowX} ${topY} V ${bottomY}`,
            `M ${elbowX} ${targetPoint.y} H ${targetPoint.x}`,
          ].join(" "),
        );
      });
    });

    if (!paths.length) return;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("bracket-connectors");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", String(els.bracketBoard.scrollWidth));
    svg.setAttribute("height", String(els.bracketBoard.scrollHeight));
    svg.setAttribute(
      "viewBox",
      `0 0 ${els.bracketBoard.scrollWidth} ${els.bracketBoard.scrollHeight}`,
    );
    svg.innerHTML = paths
      .map((path) => `<path class="bracket-connector" d="${path}" />`)
      .join("");

    els.bracketBoard.append(svg);
  }

  function renderBracket(rounds) {
    els.bracketBoard.innerHTML = ROUND_META.map((round) => {
      const matches = rounds[round.key];
      return `
        <section class="round-column" aria-label="${escapeHtml(round.label)}">
          <div class="round-title">
            <h2>${escapeHtml(round.label)}</h2>
            <span>${matches.length}</span>
          </div>
          <div class="match-stack">
            ${matches
              .map(
                (match) => `
                  <article class="match-card" data-match-id="${match.id}">
                    <div class="match-meta">
                      <span>Match ${match.id}</span>
                      <strong>${escapeHtml(match.winner?.name || "Open")}</strong>
                    </div>
                    ${renderEntrant(match, "home")}
                    ${renderEntrant(match, "away")}
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderStatus(bracket) {
    const selectedThirds = selectedThirdCodes().length;
    els.headerMeta.textContent = `${state.importName} · ${selectedThirds}/8 best thirds`;
    els.importBadge.textContent = state.importStatus;
    els.inlineStatus.textContent = bracket.assignment.message;
  }

  function renderViews() {
    els.viewButtons.forEach((button) => {
      const active = button.dataset.view === state.activeView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    els.groupsView.hidden = state.activeView !== "groups";
    els.bracketView.hidden = state.activeView !== "bracket";
  }

  function render() {
    const bracket = buildBracket();
    const rounds = displayRounds(bracket);
    renderStatus(bracket);
    renderMetrics(bracket);
    renderThirdList();
    renderLeaderboard();
    renderGroups();
    renderChampion(bracket);
    renderBracket(rounds);
    renderViews();
    renderConnectors(rounds);
    updateSubmitState();
    saveDraft();
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2800);
  }

  function cellValue(sheet, address) {
    const cell = sheet?.[address];
    if (!cell) return undefined;
    return cell.v ?? cell.w;
  }

  function normalizePick(value) {
    const pick = String(value || "").trim().toUpperCase();
    if (pick === "H") return "home";
    if (pick === "B") return "away";
    return null;
  }

  function importGroups(workbook, warnings) {
    const sheet = workbook.Sheets.Grunnspill;
    if (!sheet) {
      warnings.push("Missing Grunnspill sheet.");
      return clone(DATA.groups);
    }

    const groups = [];
    const fallbackLetters = DATA.groups.map((group) => group.id);

    for (let groupIndex = 0; groupIndex < 12; groupIndex += 1) {
      const start = 4 + groupIndex * 4;
      const groupId =
        String(cellValue(sheet, `B${start}`) || fallbackLetters[groupIndex])
          .trim()
          .toUpperCase() || fallbackLetters[groupIndex];
      const teams = [];
      const rankValues = [];
      const markedRows = new Map();

      for (let offset = 0; offset < 4; offset += 1) {
        const row = start + offset;
        const name =
          String(
            cellValue(sheet, `D${row}`) ||
              DATA.groups[groupIndex].teams[offset].name,
          ).trim() || DATA.groups[groupIndex].teams[offset].name;
        const rank = Number(cellValue(sheet, `E${row}`));
        const mark = String(cellValue(sheet, `F${row}`) || "").trim() === "1";
        rankValues.push(rank);
        markedRows.set(offset, mark);
        teams.push({ id: `${groupId}${offset + 1}`, name, rank });
      }

      const validRanks =
        rankValues.every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= 4) &&
        new Set(rankValues).size === 4;

      if (!validRanks) {
        warnings.push(`Group ${groupId} had invalid ranks; row order was used.`);
        teams.forEach((team, index) => {
          team.rank = index + 1;
        });
      }

      let bestThird = false;
      teams.forEach((team, index) => {
        if (markedRows.get(index) && team.rank === 3) bestThird = true;
        if (markedRows.get(index) && team.rank !== 3) {
          warnings.push(`Group ${groupId} marked a non-third-place team.`);
        }
      });

      groups.push({ id: groupId, name: `Group ${groupId}`, bestThird, teams });
    }

    const selected = groups.filter((group) => group.bestThird).length;
    if (selected > 8) {
      warnings.push("More than eight best third-place teams were marked.");
    }

    return groups;
  }

  function importAnnexRows(workbook, warnings) {
    const sheet = workbook.Sheets.Annex;
    if (!sheet) return clone(DATA.annexRows);

    const rows = [];
    for (let row = 4; row <= 498; row += 1) {
      const option = Number(cellValue(sheet, `A${row}`));
      const slots = ["B", "C", "D", "E", "F", "G", "H", "I"].map((col) =>
        String(cellValue(sheet, `${col}${row}`) || "").trim().toUpperCase(),
      );
      if (Number.isInteger(option) && slots.every((slot) => /^3[A-L]$/.test(slot))) {
        rows.push({ option, slots });
      }
    }

    if (rows.length !== 495) {
      warnings.push("Annex lookup was incomplete; template lookup was kept.");
      return clone(DATA.annexRows);
    }

    return rows;
  }

  function importPicks(workbook) {
    const config = [
      ["16f", 2, 17],
      ["8f", 2, 9],
      ["4f", 2, 5],
      ["2f", 2, 3],
      ["Finale", 2, 2],
    ];
    const picks = {};

    config.forEach(([sheetName, start, end]) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      for (let row = start; row <= end; row += 1) {
        const matchId = cellValue(sheet, `A${row}`);
        const pick = normalizePick(cellValue(sheet, `F${row}`));
        if (matchId && pick) picks[String(matchId)] = pick;
      }
    });

    return picks;
  }

  async function handleExcelUpload(file) {
    if (!window.XLSX) {
      showToast("Excel parser is still loading.");
      return;
    }

    const warnings = [];
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    state.groups = importGroups(workbook, warnings);
    state.annexRows = importAnnexRows(workbook, warnings);
    state.picks = importPicks(workbook);
    state.importName = file.name;
    state.importStatus = warnings.length ? "Imported with notes" : "Imported";
    render();
    showToast(
      warnings.length
        ? `${file.name} imported. ${warnings[0]}`
        : `${file.name} imported.`,
    );
  }

  function exportPicks() {
    const bracket = buildBracket();
    const payload = {
      source: state.importName,
      groups: state.groups,
      picks: state.picks,
      bestThirdMap: bracket.assignment.row,
      champion: bracket.matchesById["104"]?.winner?.name || null,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "world-cup-2026-picks.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function readApiResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    const text = await response.text();
    return {
      error:
        response.status === 404
          ? "Leaderboard backend is not running here."
          : text.slice(0, 160),
    };
  }

  function backendAvailableHere() {
    const localStaticServer =
      (location.hostname === "127.0.0.1" || location.hostname === "localhost") &&
      location.port === "5173";
    return !localStaticServer && location.protocol !== "file:";
  }

  function roundWinners(bracket, roundKey) {
    return bracket.rounds[roundKey]
      .map((match) => match.winner?.name)
      .filter(Boolean);
  }

  function currentSubmissionPayload() {
    const bracket = buildBracket();
    const champion = bracket.matchesById["104"]?.winner?.name || "";

    return {
      displayName: els.displayNameInput.value,
      champion,
      bracket: {
        groups: state.groups,
        picks: state.picks,
        bestThirdMap: bracket.assignment.row,
        champion: champion || null,
        rounds: {
          round16: roundWinners(bracket, "round32"),
          quarterfinals: roundWinners(bracket, "round16"),
          semifinals: roundWinners(bracket, "quarterfinals"),
          final: roundWinners(bracket, "semifinals"),
          champion: champion || null,
        },
        submittedAt: new Date().toISOString(),
      },
    };
  }

  async function loadLeaderboard() {
    if (!backendAvailableHere()) {
      state.leaderboard = [];
      state.leaderboardStatus = "Leaderboard available after deployment";
      renderLeaderboard();
      return;
    }

    state.leaderboardStatus = "Loading leaderboard";
    renderLeaderboard();

    try {
      const response = await fetch("/api/leaderboard", {
        headers: { accept: "application/json" },
      });
      const payload = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Leaderboard unavailable");
      }

      state.leaderboard = payload.entries || [];
      state.leaderboardStatus = state.leaderboard.length
        ? ""
        : "No submissions yet";
    } catch (error) {
      state.leaderboard = [];
      state.leaderboardStatus =
        error.message === "Failed to fetch"
          ? "Leaderboard offline"
          : error.message;
    }

    renderLeaderboard();
  }

  async function submitPicks() {
    const displayName = els.displayNameInput.value.trim();
    const selectedThirds = selectedThirdCodes().length;
    const pickCount = completedPickCount();
    const readiness = submissionReadiness();

    if (!displayName) {
      showToast("Enter a name before submitting.");
      els.displayNameInput.focus();
      return;
    }

    if (!backendAvailableHere()) {
      showToast("Submit picks from the deployed Vercel site.");
      els.submitStatus.textContent = "Available after deployment";
      return;
    }

    if (selectedThirds !== 8) {
      showToast("Select exactly eight best third-place teams first.");
      return;
    }

    if (pickCount < TOTAL_KNOCKOUT_PICKS) {
      showToast("Complete every knockout pick before submitting.");
      return;
    }

    if (!readiness.ready) {
      showToast(readiness.message);
      return;
    }

    const confirmed = await confirmPublicSubmission();
    if (!confirmed) return;

    state.submitting = true;
    updateSubmitState();

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(currentSubmissionPayload()),
      });
      const payload = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Submission failed");
      }

      els.submitStatus.textContent = "Submitted";
      showToast("Picks submitted.");
      await loadLeaderboard();
    } catch (error) {
      els.submitStatus.textContent = error.message;
      showToast(error.message);
    } finally {
      state.submitting = false;
      const submitted = els.submitStatus.textContent === "Submitted";
      updateSubmitState();
      if (submitted) els.submitStatus.textContent = "Submitted";
    }
  }

  els.groupsGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, groupId, teamId } = button.dataset;

    if (action === "move-up") moveTeam(groupId, teamId, -1);
    if (action === "move-down") moveTeam(groupId, teamId, 1);
    if (action === "toggle-third") toggleBestThird(groupId);
  });

  els.bracketBoard.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='pick-match']");
    if (!button || button.disabled) return;
    setMatchPick(button.dataset.matchId, button.dataset.side);
  });

  els.leaderboardList.addEventListener("click", (event) => {
    const button = event.target.closest(
      "button[data-action='view-public-picks']",
    );
    if (!button) return;
    openPublicPicks(button.dataset.entryId);
  });

  els.closePickModalButton.addEventListener("click", closePublicPicks);

  els.pickModal.addEventListener("click", (event) => {
    if (event.target === els.pickModal) closePublicPicks();
  });

  els.cancelSubmitConfirmButton.addEventListener("click", () => {
    resolveSubmitConfirmation(false);
  });

  els.confirmSubmitButton.addEventListener("click", () => {
    resolveSubmitConfirmation(true);
  });

  els.submitConfirmModal.addEventListener("click", (event) => {
    if (event.target === els.submitConfirmModal) {
      resolveSubmitConfirmation(false);
    }
  });

  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      render();
    });
  });

  els.excelInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    try {
      await handleExcelUpload(file);
    } catch (error) {
      console.error(error);
      showToast("Excel import failed.");
    } finally {
      event.target.value = "";
    }
  });

  els.resetButton.addEventListener("click", () => {
    state.groups = clone(DATA.groups);
    state.annexRows = clone(DATA.annexRows);
    state.picks = { ...DATA.defaultPicks };
    state.importName = DATA.sourceFile;
    state.importStatus = "Workbook";
    render();
    showToast("Template picks restored.");
  });

  els.clearKnockoutButton.addEventListener("click", () => {
    state.picks = {};
    render();
    showToast("Knockout picks cleared.");
  });

  els.exportButton.addEventListener("click", exportPicks);

  els.submitForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitPicks();
  });

  els.displayNameInput.addEventListener("input", () => {
    updateSubmitState();
    saveDraft();
  });

  els.refreshLeaderboardButton.addEventListener("click", loadLeaderboard);

  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(renderConnectors.frame);
    renderConnectors.frame = window.requestAnimationFrame(() => {
      renderConnectors(displayRounds(buildBracket()));
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.pickModal.hidden) closePublicPicks();
    if (event.key === "Escape" && !els.submitConfirmModal.hidden) {
      resolveSubmitConfirmation(false);
    }
  });

  const draftRestored = restoreDraft();
  render();
  if (draftRestored) showToast("Saved picks restored.");
  loadLeaderboard();
})();
