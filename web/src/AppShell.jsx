import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN_ID,
  EXPLORER_URL,
  LOCAL_DEMO,
  RPC_URL,
  robinhoodChain,
  walletConnectConfigured,
} from "./wallet.jsx";

export const POOL = import.meta.env.VITE_POOL_ADDRESS || "";
export const TOKEN = import.meta.env.VITE_TOKEN_ADDRESS || "";
export const TOKEN_DECIMALS = Number(import.meta.env.VITE_TOKEN_DECIMALS || 18);
export const LIVE = /^0x[a-fA-F0-9]{40}$/.test(POOL) && /^0x[a-fA-F0-9]{40}$/.test(TOKEN);
const DEMO_KEY = import.meta.env.VITE_DEMO_PRIVATE_KEY || "";
export const demoAccount = LOCAL_DEMO && /^0x[a-fA-F0-9]{64}$/.test(DEMO_KEY) ? privateKeyToAccount(DEMO_KEY) : null;

export const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) });

export const poolAbi = parseAbi([
  "function bet(uint256 gameId,uint8 outcome,uint256 amount,uint16 totalBurnBps)",
  "function nextGameId() view returns (uint256)",
  "function games(uint256 gameId) view returns (bytes32 externalKey,uint64 lockTime,uint64 proposedAt,uint8 status,uint8 proposedOutcome,uint8 finalOutcome,uint256 homePool,uint256 awayPool,string homeTeam,string awayTeam)",
  "function totalBurned() view returns (uint256)",
  "function totalProtocolFees() view returns (uint256)",
]);
export const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

const FALLBACK_GAMES = [
  { id: 1, sport: "NFL", away: "PACKERS", home: "BEARS", awayPool: 6.8, homePool: 4.2, heat: "GAME OF THE SEWER", starts: "7:20 PM" },
  { id: 2, sport: "NFL", away: "BILLS", home: "CHIEFS", awayPool: 3.1, homePool: 4.7, starts: "8:15 PM" },
  { id: 3, sport: "MLB", away: "CUBS", home: "BREWERS", awayPool: 1.2, homePool: 0.8, starts: "6:40 PM" },
];

const FALLBACK_STATS = {
  burned: 182_707_189,
  supply: 817_290_000,
  fees: 3_690_000,
  betsLabel: "48,291",
};

const burnModes = [
  { label: "NORMAL", bps: 500, icon: "🔥" },
  { label: "HOT", bps: 1000, icon: "🔥🔥" },
  { label: "UNWELL", bps: 2500, icon: "🔥🔥🔥" },
  { label: "MARTYR", bps: 5000, icon: "☠️" },
];

function pct(n, d) { return d ? Math.round((n / d) * 100) : 50; }
function compact(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function formatWhole(n) {
  return Math.round(Number(n) || 0).toLocaleString();
}
function shortAddress(address) { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""; }
function formatLock(lockTime) {
  if (!lockTime) return "TBD";
  return new Date(lockTime * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
export function walletErrorMessage(error) {
  const code = error?.code ?? error?.cause?.code;
  const message = String(error?.shortMessage || error?.message || "");
  if (code === 4001 || /rejected|denied/i.test(message)) return "Request cancelled in wallet.";
  if (code === -32002 || /already pending/i.test(message)) return "A wallet request is already open. Return to your wallet app.";
  if (/chain|network/i.test(message)) return `Switch your wallet to ${robinhoodChain.name} and try again.`;
  return message ? message.slice(0, 180) : "Wallet request failed.";
}

async function loadLiveBoard() {
  const nextId = Number(await publicClient.readContract({ address: POOL, abi: poolAbi, functionName: "nextGameId" }));
  const games = [];
  for (let id = 1; id < nextId; id += 1) {
    const g = await publicClient.readContract({ address: POOL, abi: poolAbi, functionName: "games", args: [BigInt(id)] });
    const status = Number(g.status ?? g[3]);
    if (status !== 1) continue;
    games.push({
      id,
      home: g.homeTeam ?? g[8],
      away: g.awayTeam ?? g[9],
      homePool: Number(formatUnits(g.homePool ?? g[6], TOKEN_DECIMALS)),
      awayPool: Number(formatUnits(g.awayPool ?? g[7], TOKEN_DECIMALS)),
      heat: "LIVE",
      starts: formatLock(Number(g.lockTime ?? g[1])),
      lockTime: Number(g.lockTime ?? g[1]),
    });
  }

  const [burned, fees, supply] = await Promise.all([
    publicClient.readContract({ address: POOL, abi: poolAbi, functionName: "totalBurned" }),
    publicClient.readContract({ address: POOL, abi: poolAbi, functionName: "totalProtocolFees" }),
    publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "totalSupply" }),
  ]);

  return {
    games,
    stats: {
      burned: Number(formatUnits(burned, TOKEN_DECIMALS)),
      fees: Number(formatUnits(fees, TOKEN_DECIMALS)),
      supply: Number(formatUnits(supply, TOKEN_DECIMALS)),
      betsLabel: "on-chain",
    },
  };
}

export function AppShell({ session }) {
  const {
    address,
    isConnected,
    accountStatus,
    walletProvider,
    chainId,
    walletName,
    isPhantom,
    openConnect,
    openAccount,
    switchNetwork,
  } = session;

  const [games, setGames] = useState(FALLBACK_GAMES);
  const [stats, setStats] = useState(FALLBACK_STATS);
  const [selected, setSelected] = useState(FALLBACK_GAMES[0]);
  const [side, setSide] = useState(1);
  const [amount, setAmount] = useState("100000");
  const [burnBps, setBurnBps] = useState(500);
  const [status, setStatus] = useState(LOCAL_DEMO ? "Local Hardhat demo — demo wallet auto-connected." : "");
  const [busy, setBusy] = useState(false);
  const [wasHidden, setWasHidden] = useState(false);
  const [ballBalance, setBallBalance] = useState(null);

  const connectedChainId = LOCAL_DEMO ? CHAIN_ID : chainId;
  const wrongNetwork = isConnected && !LOCAL_DEMO && connectedChainId !== CHAIN_ID;

  const refreshBoard = useCallback(async () => {
    if (!LIVE) return;
    try {
      const board = await loadLiveBoard();
      if (board.games.length) {
        setGames(board.games);
        setSelected((prev) => board.games.find((g) => g.id === prev?.id) || board.games[0]);
      }
      setStats(board.stats);
    } catch (error) {
      setStatus(`Could not load on-chain markets: ${walletErrorMessage(error)}`);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!LIVE || !address) {
      setBallBalance(null);
      return;
    }
    try {
      const bal = await publicClient.readContract({
        address: TOKEN,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      setBallBalance(Number(formatUnits(bal, TOKEN_DECIMALS)));
    } catch {
      setBallBalance(null);
    }
  }, [address]);

  useEffect(() => {
    refreshBoard();
    const id = setInterval(refreshBoard, 8_000);
    return () => clearInterval(id);
  }, [refreshBoard]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && busy) setWasHidden(true);
      if (document.visibilityState === "visible" && wasHidden && busy) {
        setStatus("Back from wallet. Checking transaction status…");
        setWasHidden(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [busy, wasHidden]);

  useEffect(() => {
    if (isConnected && wrongNetwork) setStatus(`Connected to ${walletName}. Switch to ${robinhoodChain.name} to bet.`);
  }, [isConnected, wrongNetwork, walletName]);

  const economics = useMemo(() => {
    const gross = Number(amount || 0);
    const burn = gross * burnBps / 10000;
    const fee = gross * 0.02;
    return { gross, burn, fee, stake: Math.max(0, gross - burn - fee) };
  }, [amount, burnBps]);

  async function connect() {
    if (LOCAL_DEMO && demoAccount) {
      setStatus(`Local demo wallet ${shortAddress(demoAccount.address)} is ready.`);
      return;
    }
    if (!walletConnectConfigured) {
      setStatus("WalletConnect setup required: add VITE_REOWN_PROJECT_ID to web/.env.");
      return;
    }
    await openConnect();
  }

  async function onAccountClick() {
    if (LOCAL_DEMO && demoAccount) {
      setStatus(`Local demo · ${shortAddress(demoAccount.address)}${ballBalance != null ? ` · ${formatWhole(ballBalance)} BALL` : ""}`);
      return;
    }
    await openAccount();
  }

  async function ensureNetwork() {
    if (LOCAL_DEMO || Number(chainId) === CHAIN_ID) return;
    setStatus(`Switching ${walletName} to ${robinhoodChain.name}…`);
    await switchNetwork();
  }

  async function placeBet() {
    if (!isConnected || !address) { await connect(); return; }
    if (!LIVE) {
      setStatus(`UI-only demo bet: ${amount} BALL on ${side === 1 ? selected.home : selected.away} at ${burnBps / 100}% burn.`);
      return;
    }
    if (!LOCAL_DEMO && !walletProvider) {
      setStatus("Wallet provider is still reconnecting. Try again in a moment.");
      return;
    }

    let value;
    try {
      value = parseUnits(amount || "0", TOKEN_DECIMALS);
      if (value <= 0n) throw new Error("Enter a wager greater than zero.");
    } catch (error) { setStatus(walletErrorMessage(error)); return; }

    setBusy(true);
    try {
      await ensureNetwork();
      const wallet = LOCAL_DEMO && demoAccount
        ? createWalletClient({ account: demoAccount, chain: robinhoodChain, transport: http(RPC_URL) })
        : createWalletClient({ account: address, chain: robinhoodChain, transport: custom(walletProvider) });

      const balance = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      if (balance < value) throw new Error("Not enough BALL in this wallet.");
      const allowance = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "allowance", args: [address, POOL] });
      if (allowance < value) {
        setStatus(LOCAL_DEMO ? "Approving BALL for the pool…" : "Approval required. Confirm BALL approval in your wallet…");
        const approvalHash = await wallet.writeContract({ address: TOKEN, abi: erc20Abi, functionName: "approve", args: [POOL, value] });
        setStatus("Approval sent. Waiting for confirmation…");
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }
      setStatus(LOCAL_DEMO ? "Sending bet on Hardhat…" : "Confirm the bet in your wallet…");
      const hash = await wallet.writeContract({
        address: POOL,
        abi: poolAbi,
        functionName: "bet",
        args: [BigInt(selected.id), side, value, burnBps],
      });
      setStatus("Bet sent. Waiting for confirmation…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted onchain.");
      setStatus(`Bet confirmed · ${hash.slice(0, 10)}…`);
      await Promise.all([refreshBoard(), refreshBalance()]);
    } catch (error) { setStatus(walletErrorMessage(error)); }
    finally { setBusy(false); }
  }

  return (
    <div className="shell">
      <nav>
        <div className="logo"><span className="ball">●</span> $BALL</div>
        <div className="tag">{LOCAL_DEMO ? "LOCAL HARDHAT DEMO" : "SPORTS WILL DESTROY THIS TOKEN"}</div>
        <button className="walletButton" onClick={isConnected ? onAccountClick : connect} disabled={!LOCAL_DEMO && accountStatus === "connecting"}>
          {!LOCAL_DEMO && accountStatus === "connecting"
            ? "CONNECTING…"
            : isConnected
              ? `${walletName} ${shortAddress(address)}`
              : "CONNECT WALLET"}
        </button>
      </nav>
      {isConnected && (
        <div className={wrongNetwork ? "walletStrip warning" : "walletStrip"}>
          <span>{walletName} · {shortAddress(address)}{ballBalance != null ? ` · ${compact(ballBalance)} BALL` : ""}</span>
          <span>{wrongNetwork ? `Wrong network · chain ${connectedChainId || "?"}` : `✓ ${robinhoodChain.name}`}</span>
          {wrongNetwork && <button onClick={ensureNetwork}>SWITCH NETWORK</button>}
        </div>
      )}
      {LOCAL_DEMO && (
        <div className="compatNotice">
          Local demo mode: Hardhat account auto-connected, markets loaded from BallPool at {shortAddress(POOL)}. No MetaMask or Reown project ID required.
        </div>
      )}
      {isPhantom && !LOCAL_DEMO && (
        <div className="compatNotice">
          Phantom wallet detected. The frontend uses standard EVM provider methods, but Phantom currently documents Robinhood Chain dapp connections as unavailable. If Phantom refuses the connection or transaction, use MetaMask until Phantom enables it.
        </div>
      )}
      <header className="hero">
        <div>
          <div className="eyebrow">{LOCAL_DEMO ? "LOCAL HARDHAT · ON-CHAIN DEMO" : "ROBINHOOD CHAIN'S SPORTS-BURNING MEMECOIN"}</div>
          <h1>BET IT.<br /><span>BURN IT.</span><br />SURVIVE.</h1>
          <p>Every wager destroys supply. Winners eat the losing pool. The protocol takes its cut. The sewer remembers everything.</p>
        </div>
        <div className="incinerator">
          <div className="incLabel">🔥 THE INCINERATOR</div>
          <div className="burned">{formatWhole(stats.burned)}</div>
          <div className="muted">BALL DESTROYED FOREVER</div>
          <div className="supply"><span>SUPPLY REMAINING</span><b>{compact(stats.supply)}</b></div>
          <div className="supply"><span>PROTOCOL FEES</span><b>{compact(stats.fees)}</b></div>
          <div className="supply"><span>TOTAL BETS</span><b>{stats.betsLabel}</b></div>
        </div>
      </header>
      <section className="board">
        <div className="sectionTitle">
          <span>LIVE BATTLE POOLS</span>
          <small>5% base burn · 2% protocol · pari-mutuel payouts</small>
        </div>
        <div className="games">
          {games.map((g) => {
            const total = g.homePool + g.awayPool;
            return (
              <article key={g.id} className={selected.id === g.id ? "game selected" : "game"} onClick={() => setSelected(g)}>
                <div className="gameTop"><span>{g.heat || g.sport}</span><time>{g.starts}</time></div>
                <div className="matchup">
                  <button onClick={(e) => { e.stopPropagation(); setSelected(g); setSide(2); }}>
                    <b>{g.away}</b><strong>{pct(g.awayPool, total)}%</strong><em>{compact(g.awayPool)} BALL</em>
                  </button>
                  <i>VS</i>
                  <button onClick={(e) => { e.stopPropagation(); setSelected(g); setSide(1); }}>
                    <b>{g.home}</b><strong>{pct(g.homePool, total)}%</strong><em>{compact(g.homePool)} BALL</em>
                  </button>
                </div>
                <div className="poolbar"><span style={{ width: `${pct(g.awayPool, total)}%` }}></span></div>
              </article>
            );
          })}
        </div>
        <aside className="ticket">
          <div className="ticketTitle">YOUR BAD DECISION</div>
          <div className="pick">{selected.away} @ {selected.home}</div>
          <div className="sideRow">
            <button className={side === 2 ? "active" : ""} onClick={() => setSide(2)}>{selected.away}</button>
            <button className={side === 1 ? "active" : ""} onClick={() => setSide(1)}>{selected.home}</button>
          </div>
          <label>WAGER</label>
          <div className="amount">
            <input
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-label="Wager amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            <span>BALL</span>
          </div>
          <label>BURN MODE</label>
          <div className="burnModes">
            {burnModes.map((m) => (
              <button key={m.bps} className={burnBps === m.bps ? "active" : ""} onClick={() => setBurnBps(m.bps)}>
                <span>{m.icon}</span><b>{m.label}</b><small>{m.bps / 100}%</small>
              </button>
            ))}
          </div>
          <div className="math">
            <div><span>Gross wager</span><b>{economics.gross.toLocaleString()} BALL</b></div>
            <div><span>Destroyed</span><b>-{economics.burn.toLocaleString()} BALL</b></div>
            <div><span>Protocol</span><b>-{economics.fee.toLocaleString()} BALL</b></div>
            <div className="stake"><span>Effective pool stake</span><b>{economics.stake.toLocaleString()} BALL</b></div>
          </div>
          <button className="send" onClick={placeBet} disabled={busy}>
            {busy ? (LOCAL_DEMO ? "SENDING…" : "CHECK YOUR WALLET…") : isConnected ? wrongNetwork ? "SWITCH & BET" : "SEND IT TO THE SEWER" : "CONNECT & BET"}
          </button>
          <p className="mobileHint">
            {LOCAL_DEMO
              ? "Local demo signs with a Hardhat key over HTTP — no browser wallet popup."
              : "Mobile: connection and signing may hand off to your wallet app. Return here after approving; the session stays connected."}
          </p>
          <p className="disclaimer">Burns and protocol fees are irreversible. Cancelled markets refund only effective pool stake.</p>
          {status && <div className="status" role="status" aria-live="polite">{status}</div>}
          {status.includes("confirmed") && LIVE && EXPLORER_URL && (
            <a className="explorerLink" href={EXPLORER_URL} target="_blank" rel="noreferrer">OPEN EXPLORER ↗</a>
          )}
        </aside>
      </section>
      <section className="leaderboards">
        <div><h3>🔥 THE INCINERATOR</h3><ol><li><b>0x69…0420</b><span>118.4M</span></li><li><b>sewerlord.eth</b><span>91.2M</span></li><li><b>0x71…DEAD</b><span>64.8M</span></li></ol></div>
        <div><h3>💀 HALL OF SHAME</h3><ol><li><b>InverseMe.eth</b><span>9 losses</span></li><li><b>BallFondler</b><span>-31.8M</span></li><li><b>0x00…BEEF</b><span>7 losses</span></li></ol></div>
        <div><h3>🐀 SEWER LEAGUE</h3><ol><li><b>RatKing</b><span>8,721</span></li><li><b>SportsGod</b><span>8,441</span></li><li><b>Andre</b><span>8,211</span></li></ol></div>
      </section>
    </div>
  );
}
