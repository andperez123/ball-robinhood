import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPublicClient, createWalletClient, custom, http, parseAbi, parseUnits } from "viem";
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useWalletInfo } from "@reown/appkit/react";
import { CHAIN_ID, EXPLORER_URL, RPC_URL, Web3Provider, robinhoodChain, walletConnectConfigured } from "./wallet.jsx";
import "./styles.css";

const POOL = import.meta.env.VITE_POOL_ADDRESS || "";
const TOKEN = import.meta.env.VITE_TOKEN_ADDRESS || "";
const TOKEN_DECIMALS = Number(import.meta.env.VITE_TOKEN_DECIMALS || 18);
const LIVE = /^0x[a-fA-F0-9]{40}$/.test(POOL) && /^0x[a-fA-F0-9]{40}$/.test(TOKEN);

const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) });
const poolAbi = parseAbi([
  "function bet(uint256 gameId,uint8 outcome,uint256 amount,uint16 totalBurnBps)",
  "function quoteBet(uint256 amount,uint16 totalBurnBps) view returns (uint256 burnAmount,uint256 protocolFee,uint256 effectiveStake)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const games = [
  { id: 1, sport: "NFL", away: "PACKERS", home: "BEARS", awayPool: 6.8, homePool: 4.2, heat: "GAME OF THE SEWER", starts: "7:20 PM" },
  { id: 2, sport: "NFL", away: "BILLS", home: "CHIEFS", awayPool: 3.1, homePool: 4.7, starts: "8:15 PM" },
  { id: 3, sport: "MLB", away: "CUBS", home: "BREWERS", awayPool: 1.2, homePool: 0.8, starts: "6:40 PM" },
];
const burnModes = [
  { label: "NORMAL", bps: 500, icon: "🔥" },
  { label: "HOT", bps: 1000, icon: "🔥🔥" },
  { label: "UNWELL", bps: 2500, icon: "🔥🔥🔥" },
  { label: "MARTYR", bps: 5000, icon: "☠️" },
];

function pct(n, d) { return d ? Math.round((n / d) * 100) : 50; }
function compact(n) { return `${n.toFixed(1)}M`; }
function shortAddress(address) { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""; }
function walletErrorMessage(error) {
  const code = error?.code ?? error?.cause?.code;
  const message = String(error?.shortMessage || error?.message || "");
  if (code === 4001 || /rejected|denied/i.test(message)) return "Request cancelled in wallet.";
  if (code === -32002 || /already pending/i.test(message)) return "A wallet request is already open. Return to your wallet app.";
  if (/chain|network/i.test(message)) return "Switch your wallet to Robinhood Chain and try again.";
  return message ? message.slice(0, 180) : "Wallet request failed.";
}

function App() {
  const { open } = useAppKit();
  const { address, isConnected, status: accountStatus } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider("eip155");
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletInfo } = useWalletInfo();
  const [selected, setSelected] = useState(games[0]);
  const [side, setSide] = useState(1);
  const [amount, setAmount] = useState("100000");
  const [burnBps, setBurnBps] = useState(500);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasHidden, setWasHidden] = useState(false);

  const connectedChainId = chainId ? Number(chainId) : null;
  const wrongNetwork = isConnected && connectedChainId !== CHAIN_ID;
  const walletName = walletInfo?.name || "Wallet";
  const isPhantom = /phantom/i.test(walletName);

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
    if (isConnected && wrongNetwork) setStatus(`Connected to ${walletName}. Switch to Robinhood Chain to bet.`);
  }, [isConnected, wrongNetwork, walletName]);

  const economics = useMemo(() => {
    const gross = Number(amount || 0);
    const burn = gross * burnBps / 10000;
    const fee = gross * 0.02;
    return { gross, burn, fee, stake: Math.max(0, gross - burn - fee) };
  }, [amount, burnBps]);

  async function connect() {
    if (!walletConnectConfigured) {
      setStatus("WalletConnect setup required: add VITE_REOWN_PROJECT_ID to web/.env.");
      return;
    }
    await open({ view: "Connect", namespace: "eip155" });
  }

  async function openAccount() { await open({ view: "Account" }); }

  async function ensureNetwork() {
    if (Number(chainId) === CHAIN_ID) return;
    setStatus(`Switching ${walletName} to ${robinhoodChain.name}…`);
    await switchNetwork(robinhoodChain);
  }

  async function placeBet() {
    if (!isConnected || !address) { await connect(); return; }
    if (!walletProvider) { setStatus("Wallet provider is still reconnecting. Try again in a moment."); return; }
    if (!LIVE) {
      setStatus(`Demo bet: ${amount} BALL on ${side === 1 ? selected.home : selected.away} at ${burnBps / 100}% burn.`);
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
      const wallet = createWalletClient({ account: address, chain: robinhoodChain, transport: custom(walletProvider) });
      const balance = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      if (balance < value) throw new Error("Not enough BALL in this wallet.");
      const allowance = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "allowance", args: [address, POOL] });
      if (allowance < value) {
        setStatus("Approval required. Confirm BALL approval in your wallet…");
        const approvalHash = await wallet.writeContract({ address: TOKEN, abi: erc20Abi, functionName: "approve", args: [POOL, value] });
        setStatus("Approval sent. Waiting for Robinhood Chain…");
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }
      setStatus("Confirm the bet in your wallet…");
      const hash = await wallet.writeContract({ address: POOL, abi: poolAbi, functionName: "bet", args: [BigInt(selected.id), side, value, burnBps] });
      setStatus("Bet sent. Waiting for confirmation…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted onchain.");
      setStatus(`Bet confirmed · ${hash.slice(0, 10)}…`);
    } catch (error) { setStatus(walletErrorMessage(error)); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <nav><div className="logo"><span className="ball">●</span> $BALL</div><div className="tag">SPORTS WILL DESTROY THIS TOKEN</div><button className="walletButton" onClick={isConnected ? openAccount : connect} disabled={accountStatus === "connecting"}>{accountStatus === "connecting" ? "CONNECTING…" : isConnected ? `${walletName} ${shortAddress(address)}` : "CONNECT WALLET"}</button></nav>
    {isConnected && <div className={wrongNetwork ? "walletStrip warning" : "walletStrip"}><span>{walletName} · {shortAddress(address)}</span><span>{wrongNetwork ? `Wrong network · chain ${connectedChainId || "?"}` : `✓ ${robinhoodChain.name}`}</span>{wrongNetwork && <button onClick={ensureNetwork}>SWITCH NETWORK</button>}</div>}
    {isPhantom && <div className="compatNotice">Phantom wallet detected. The frontend uses standard EVM provider methods, but Phantom currently documents Robinhood Chain dapp connections as unavailable. If Phantom refuses the connection or transaction, use MetaMask until Phantom enables it.</div>}
    <header className="hero"><div><div className="eyebrow">ROBINHOOD CHAIN'S SPORTS-BURNING MEMECOIN</div><h1>BET IT.<br/><span>BURN IT.</span><br/>SURVIVE.</h1><p>Every wager destroys supply. Winners eat the losing pool. The protocol takes its cut. The sewer remembers everything.</p></div><div className="incinerator"><div className="incLabel">🔥 THE INCINERATOR</div><div className="burned">182,707,189</div><div className="muted">BALL DESTROYED FOREVER</div><div className="supply"><span>SUPPLY REMAINING</span><b>817.29M</b></div><div className="supply"><span>PROTOCOL FEES</span><b>3.69M</b></div><div className="supply"><span>TOTAL BETS</span><b>48,291</b></div></div></header>
    <section className="board"><div className="sectionTitle"><span>LIVE BATTLE POOLS</span><small>5% base burn · 2% protocol · pari-mutuel payouts</small></div><div className="games">{games.map(g => { const total = g.homePool + g.awayPool; return <article key={g.id} className={selected.id === g.id ? "game selected" : "game"} onClick={() => setSelected(g)}><div className="gameTop"><span>{g.heat || g.sport}</span><time>{g.starts}</time></div><div className="matchup"><button onClick={(e)=>{e.stopPropagation();setSelected(g);setSide(2)}}><b>{g.away}</b><strong>{pct(g.awayPool,total)}%</strong><em>{compact(g.awayPool)} BALL</em></button><i>VS</i><button onClick={(e)=>{e.stopPropagation();setSelected(g);setSide(1)}}><b>{g.home}</b><strong>{pct(g.homePool,total)}%</strong><em>{compact(g.homePool)} BALL</em></button></div><div className="poolbar"><span style={{width:`${pct(g.awayPool,total)}%`}}></span></div></article>; })}</div>
      <aside className="ticket"><div className="ticketTitle">YOUR BAD DECISION</div><div className="pick">{selected.away} @ {selected.home}</div><div className="sideRow"><button className={side===2?"active":""} onClick={()=>setSide(2)}>{selected.away}</button><button className={side===1?"active":""} onClick={()=>setSide(1)}>{selected.home}</button></div><label>WAGER</label><div className="amount"><input inputMode="decimal" enterKeyHint="done" autoComplete="off" aria-label="Wager amount" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g,""))}/><span>BALL</span></div><label>BURN MODE</label><div className="burnModes">{burnModes.map(m=><button key={m.bps} className={burnBps===m.bps?"active":""} onClick={()=>setBurnBps(m.bps)}><span>{m.icon}</span><b>{m.label}</b><small>{m.bps/100}%</small></button>)}</div><div className="math"><div><span>Gross wager</span><b>{economics.gross.toLocaleString()} BALL</b></div><div><span>Destroyed</span><b>-{economics.burn.toLocaleString()} BALL</b></div><div><span>Protocol</span><b>-{economics.fee.toLocaleString()} BALL</b></div><div className="stake"><span>Effective pool stake</span><b>{economics.stake.toLocaleString()} BALL</b></div></div><button className="send" onClick={placeBet} disabled={busy}>{busy ? "CHECK YOUR WALLET…" : isConnected ? wrongNetwork ? "SWITCH & BET" : "SEND IT TO THE SEWER" : "CONNECT & BET"}</button><p className="mobileHint">Mobile: connection and signing may hand off to your wallet app. Return here after approving; the session stays connected.</p><p className="disclaimer">Burns and protocol fees are irreversible. Cancelled markets refund only effective pool stake.</p>{status && <div className="status" role="status" aria-live="polite">{status}</div>}{status.includes("confirmed") && LIVE && <a className="explorerLink" href={EXPLORER_URL} target="_blank" rel="noreferrer">OPEN ROBINHOOD CHAIN EXPLORER ↗</a>}</aside>
    </section>
    <section className="leaderboards"><div><h3>🔥 THE INCINERATOR</h3><ol><li><b>0x69…0420</b><span>118.4M</span></li><li><b>sewerlord.eth</b><span>91.2M</span></li><li><b>0x71…DEAD</b><span>64.8M</span></li></ol></div><div><h3>💀 HALL OF SHAME</h3><ol><li><b>InverseMe.eth</b><span>9 losses</span></li><li><b>BallFondler</b><span>-31.8M</span></li><li><b>0x00…BEEF</b><span>7 losses</span></li></ol></div><div><h3>🐀 SEWER LEAGUE</h3><ol><li><b>RatKing</b><span>8,721</span></li><li><b>SportsGod</b><span>8,441</span></li><li><b>Andre</b><span>8,211</span></li></ol></div></section>
  </div>;
}

createRoot(document.getElementById("root")).render(<Web3Provider><App/></Web3Provider>);
