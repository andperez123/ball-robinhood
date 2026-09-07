import "dotenv/config";

export const config = {
  oddsApiKey: process.env.THE_ODDS_API_KEY || "",
  sportsDbKey: process.env.THESPORTSDB_API_KEY || "123",
  privateKey: process.env.ORACLE_PRIVATE_KEY || "",
  poolAddress: process.env.BALL_POOL_ADDRESS || "",
  rpcUrl: process.env.RH_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
  chainId: Number(process.env.RH_CHAIN_ID || 46630),
  sportKeys: (process.env.SPORT_KEYS || "americanfootball_nfl,basketball_nba,baseball_mlb")
    .split(",").map(x => x.trim()).filter(Boolean),
  lookaheadHours: Number(process.env.LOOKAHEAD_HOURS || 48),
  lockBufferSeconds: Number(process.env.LOCK_BUFFER_SECONDS || 60),
  dryRun: String(process.env.DRY_RUN || "false").toLowerCase() === "true",
};

export function assertConfig({ chainRequired = true } = {}) {
  if (!config.oddsApiKey) throw new Error("THE_ODDS_API_KEY is required");
  if (chainRequired && !config.dryRun) {
    if (!config.privateKey) throw new Error("ORACLE_PRIVATE_KEY is required");
    if (!config.poolAddress) throw new Error("BALL_POOL_ADDRESS is required");
  }
}
