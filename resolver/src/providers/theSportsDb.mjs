const BASE = "https://www.thesportsdb.com/api/v1/json";

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function teamsMatch(event, home, away) {
  return normalize(event.strHomeTeam) === normalize(home) && normalize(event.strAwayTeam) === normalize(away);
}

async function search(apiKey, query, date) {
  const u = new URL(`${BASE}/${apiKey}/searchevents.php`);
  u.searchParams.set("e", query.replace(/\s+/g, "_"));
  u.searchParams.set("d", date);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.event || data.events || [];
}

export async function confirmFinal(apiKey, { homeTeam, awayTeam, commenceTime }) {
  const date = String(commenceTime).slice(0, 10);
  const queries = [`${homeTeam}_vs_${awayTeam}`, `${awayTeam}_vs_${homeTeam}`];
  let candidates = [];
  for (const q of queries) {
    candidates = candidates.concat(await search(apiKey, q, date));
    if (candidates.some(e => teamsMatch(e, homeTeam, awayTeam))) break;
  }

  const event = candidates.find(e => teamsMatch(e, homeTeam, awayTeam));
  if (!event) return { confirmed: false, reason: "secondary_event_not_found" };

  const finished = new Set(["FT", "AOT", "AET", "AP"]);
  const status = String(event.strStatus || event.strProgress || "").toUpperCase();
  if (!finished.has(status) && status !== "FINAL") {
    return { confirmed: false, reason: `secondary_not_final:${status || "unknown"}` };
  }

  const homeScore = Number(event.intHomeScore);
  const awayScore = Number(event.intAwayScore);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { confirmed: false, reason: "secondary_score_missing" };
  }

  return { confirmed: true, homeScore, awayScore, eventId: event.idEvent, status };
}
