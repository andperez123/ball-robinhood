import { config, assertConfig } from "./config.mjs";
import { listEvents, getScore, scoreMap } from "./providers/theOddsApi.mjs";
import { confirmFinal } from "./providers/theSportsDb.mjs";
import { loadMarkets, saveMarkets } from "./store.mjs";
import { externalKey, createGameOnchain, proposeResultOnchain, finalizeOnchain, readGameState, readDisputeWindow } from "./chain.mjs";

const log = (...args) => console.log(new Date().toISOString(), ...args);

async function syncMarkets() {
  assertConfig();
  const markets = await loadMarkets();
  const known = new Set(markets.map(m => `${m.sportKey}:${m.eventId}`));
  const now = Date.now();
  const to = new Date(now + config.lookaheadHours * 3600_000).toISOString();

  for (const sportKey of config.sportKeys) {
    const events = await listEvents(config.oddsApiKey, sportKey, new Date(now).toISOString(), to);
    for (const e of events) {
      const id = `${sportKey}:${e.id}`;
      if (known.has(id)) continue;
      const commenceMs = Date.parse(e.commence_time);
      const lockTime = Math.floor(commenceMs / 1000) - config.lockBufferSeconds;
      if (lockTime <= Math.floor(Date.now() / 1000)) continue;
      const key = externalKey(sportKey, e.id);

      if (config.dryRun) {
        log("DRY create", sportKey, e.away_team, "@", e.home_team, "lock", new Date(lockTime * 1000).toISOString());
        markets.push({ sportKey, eventId: e.id, gameId: null, key, homeTeam: e.home_team, awayTeam: e.away_team, commenceTime: e.commence_time, lockTime, state: "dry" });
      } else {
        const tx = await createGameOnchain({ key, lockTime, homeTeam: e.home_team, awayTeam: e.away_team });
        log("CREATED", tx.gameId.toString(), e.away_team, "@", e.home_team, tx.hash);
        markets.push({ sportKey, eventId: e.id, gameId: tx.gameId.toString(), key, homeTeam: e.home_team, awayTeam: e.away_team, commenceTime: e.commence_time, lockTime, state: "open", createTx: tx.hash });
      }
      known.add(id);
    }
  }
  await saveMarkets(markets);
}

function primaryScores(row, market) {
  const scores = scoreMap(row);
  return { home: scores.get(market.homeTeam), away: scores.get(market.awayTeam) };
}

async function resolveMarkets() {
  assertConfig();
  const markets = await loadMarkets();

  for (const m of markets) {
    if (!m.gameId || ["resolved", "needs_review"].includes(m.state)) continue;

    if (m.state === "proposed") {
      if (config.dryRun) continue;
      const g = await readGameState(m.gameId);
      const disputeWindow = Number(await readDisputeWindow());
      const status = Number(g[2]);
      const proposedAt = Number(g[1]);
      if (status === 2 && Math.floor(Date.now() / 1000) >= proposedAt + disputeWindow) {
        try {
          const hash = await finalizeOnchain(m.gameId);
          m.state = "resolved";
          m.finalizeTx = hash;
          log("FINALIZED", m.gameId, hash);
        } catch (e) { log("finalize skipped", m.gameId, e.shortMessage || e.message); }
      }
      continue;
    }

    const primary = await getScore(config.oddsApiKey, m.sportKey, m.eventId);
    if (!primary?.completed || !primary.scores) continue;
    const p = primaryScores(primary, m);
    if (!Number.isFinite(p.home) || !Number.isFinite(p.away)) {
      m.state = "needs_review"; m.reason = "primary_score_missing"; continue;
    }

    const secondary = await confirmFinal(config.sportsDbKey, m);
    if (!secondary.confirmed) { log("WAIT secondary", m.gameId, secondary.reason); continue; }
    if (secondary.homeScore !== p.home || secondary.awayScore !== p.away) {
      m.state = "needs_review";
      m.reason = `score_mismatch primary=${p.home}-${p.away} secondary=${secondary.homeScore}-${secondary.awayScore}`;
      log("REVIEW", m.gameId, m.reason);
      continue;
    }
    if (p.home === p.away) {
      m.state = "needs_review";
      m.reason = "tie_requires_void_or_3way_market";
      log("REVIEW", m.gameId, m.reason);
      continue;
    }

    const outcome = p.home > p.away ? 1 : 2;
    if (config.dryRun) {
      log("DRY propose", m.gameId, outcome === 1 ? "HOME" : "AWAY", `${p.home}-${p.away}`);
    } else {
      const hash = await proposeResultOnchain(m.gameId, outcome);
      m.state = "proposed";
      m.proposeTx = hash;
      m.result = { homeScore: p.home, awayScore: p.away, secondaryEventId: secondary.eventId };
      log("PROPOSED", m.gameId, outcome === 1 ? "HOME" : "AWAY", hash);
    }
  }
  await saveMarkets(markets);
}

const mode = process.argv[2] || "run";
if (mode === "sync") await syncMarkets();
else if (mode === "resolve") await resolveMarkets();
else if (mode === "run") { await syncMarkets(); await resolveMarkets(); }
else throw new Error(`Unknown mode: ${mode}`);
