# $BALL — Robinhood Chain sports-burning meme game

A fixed-supply meme token with a two-sided pari-mutuel sports game attached. Every wager burns tokens, sends a transparent protocol fee to treasury, and contributes the remainder to the winner-take-pool economics.

## V0 economics

- 5% base burn
- 2% protocol fee
- 93% effective pool stake
- Optional 10% / 25% / 50% total burn modes for status/clout; extra burn reduces effective stake and gives no payout advantage.
- Winners split the total effective pool pro rata.
- If the winning side has zero stake, the market pushes and effective stakes are returned.
- Cancelled markets return effective stake only. Burn and protocol fee are irreversible.

## Architecture

```text
The Odds API ───────┐
                    ├─ resolver bot ─ create/propose/finalize ─ Robinhood Chain
TheSportsDB ────────┘                                    │
                                                         ▼
hood.dev-style BALL ERC20 ─ approve ───────────────► BallPool.sol
                                                         │
                              ┌──────────────┬───────────┴────────────┐
                              ▼              ▼                        ▼
                           burn()          treasury                game pool
```

The primary feed supplies canonical event IDs, schedules and completed scores. A second provider independently confirms teams and final score. The bot only proposes a result when both agree. A dispute window then delays finalization.

## Packages

- `contracts/` — Solidity contracts + Hardhat tests/deploy script.
- `resolver/` — automated market creator and two-source result resolver.
- `web/` — meme-first React/Vite betting UI with real wallet approve/bet wiring once addresses are configured.
- `docs/` — operating model, security assumptions and launch checklist.

## Robinhood Chain

Mainnet: chain `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`.
Testnet: chain `46630`, RPC `https://rpc.testnet.chain.robinhood.com`.
ETH pays gas.

## Run locally

```bash
npm install
npm run test:contracts
npm --workspace web run dev
```

### Deploy contracts to Robinhood Chain testnet

```bash
cp contracts/.env.example contracts/.env
# add a throwaway testnet PRIVATE_KEY and treasury/oracle addresses
npm --workspace contracts run deploy:testnet
```

For testnet, `deploy.js` deploys `TestBallToken` if `BALL_TOKEN_ADDRESS` is blank. For production, point `BALL_TOKEN_ADDRESS` at the fixed-supply burnable token used by the project.

### Run the resolver

```bash
cp resolver/.env.example resolver/.env
# add The Odds API key; leave DRY_RUN=true first
npm --workspace resolver run dry-run
```

Production loop recommendation: run `sync` every 15 minutes and `resolve` every 5 minutes. The contract itself enforces the dispute window.

## Not production-ready yet

This repository is an MVP scaffold, not audited production gambling software. Before any real-value deployment: contract audit, oracle key hardening/multisig controls, provider commercial-use review, jurisdiction/legal analysis, geofencing/compliance decisions, monitoring, incident runbook and a mainnet-fork test suite.

## Mobile wallet compatibility

The web frontend uses **Reown AppKit + WalletConnect + Wagmi**, instead of directly depending on `window.ethereum`. This gives the dapp a single EIP-155 wallet layer for:

- MetaMask extension and MetaMask Mobile app handoff
- WalletConnect-compatible mobile wallets
- EIP-6963 injected-wallet discovery when multiple browser wallets are installed
- session reconnection after returning from a wallet app
- Robinhood Chain network validation/switching
- standard EIP-1193 transaction signing through the connected provider

### Required mobile-wallet configuration

1. Create a Reown Cloud project and set `VITE_REOWN_PROJECT_ID`.
2. Set `VITE_APP_URL` to the exact deployed HTTPS origin and allowlist that origin in Reown.
3. Configure `4663` for mainnet or `46630` for testnet.
4. Test the deployed HTTPS site from iOS Safari, Android Chrome, MetaMask Mobile, and each target wallet's in-app browser before launch.

MetaMask can add/switch EVM-compatible networks and is the primary supported mobile wallet for Robinhood Chain in V0.

### Phantom limitation as of September 2026

The frontend is Phantom-ready through the same standards-based EVM connection layer, and Phantom currently lists Robinhood Chain plus Robinhood Chain Testnet as supported networks. However, Phantom's current help documentation separately states that **connecting to dapps on Robinhood Chain is not supported**. That is a wallet-side limitation and cannot be fixed by frontend code. Keep Phantom visible for forward compatibility, but do not advertise Robinhood Chain Phantom betting as working until Phantom enables dapp connections on the chain and it passes device testing.
