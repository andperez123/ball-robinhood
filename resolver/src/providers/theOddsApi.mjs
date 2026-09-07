const BASE = "https://api.the-odds-api.com/v4";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The Odds API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listEvents(apiKey, sportKey, fromIso, toIso) {
  const u = new URL(`${BASE}/sports/${sportKey}/events`);
  u.searchParams.set("apiKey", apiKey);
  u.searchParams.set("dateFormat", "iso");
  if (fromIso) u.searchParams.set("commenceTimeFrom", fromIso);
  if (toIso) u.searchParams.set("commenceTimeTo", toIso);
  return getJson(u);
}

export async function getScore(apiKey, sportKey, eventId) {
  const u = new URL(`${BASE}/sports/${sportKey}/scores/`);
  u.searchParams.set("apiKey", apiKey);
  u.searchParams.set("daysFrom", "3");
  u.searchParams.set("dateFormat", "iso");
  u.searchParams.set("eventIds", eventId);
  const rows = await getJson(u);
  return rows[0] || null;
}

export function scoreMap(row) {
  const out = new Map();
  for (const item of row?.scores || []) out.set(item.name, Number(item.score));
  return out;
}
