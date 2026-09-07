# Mobile Web3 wallet acceptance tests

A wallet is not considered supported until the deployed HTTPS build passes the applicable tests below on a real device.

## Required production configuration

- `VITE_REOWN_PROJECT_ID` is a valid Reown Cloud project ID.
- `VITE_APP_URL` exactly matches the deployed HTTPS origin and is allowlisted in Reown.
- Robinhood Chain network values match the official chain configuration.
- Contract addresses point to the same Robinhood Chain network configured by `VITE_CHAIN_ID`.
- Production RPC is not a rate-limited public endpoint.

## MetaMask Mobile — required

Test on current iOS and Android releases.

1. Open the dapp in Safari/Chrome.
2. Tap Connect Wallet → MetaMask.
3. Confirm the OS handoff opens MetaMask Mobile.
4. Approve connection and verify the browser restores the connected session.
5. Verify account address and wallet name render correctly.
6. Switch from another chain to Robinhood Chain through the dapp.
7. With no token allowance, place a bet and complete approval + bet.
8. With sufficient allowance, place a second bet and verify only the bet signature is requested.
9. Reject an approval and verify the dapp returns to an actionable state.
10. Reject a bet and verify the dapp returns to an actionable state.
11. Background the browser during signing, return after approval, and confirm receipt tracking completes.
12. Kill/reopen the browser and verify the wallet session reconnects or cleanly prompts to reconnect.
13. Verify insufficient BALL gives a useful error before signing.
14. Verify wrong-network state cannot silently submit a transaction.

## MetaMask in-app browser — required

Repeat connection, network switch, approval, bet, reject, and reconnect tests from MetaMask's own in-app browser.

## Phantom — gated

The UI and connection layer are standards-compatible with Phantom EVM/WalletConnect, but Robinhood Chain Phantom support must remain gated until Phantom itself supports dapp connections on Robinhood Chain.

When Phantom enables that capability, run the same acceptance suite as MetaMask on:

- Phantom iOS in-app browser
- Phantom Android in-app browser
- Phantom desktop extension
- Robinhood Chain mainnet
- Robinhood Chain testnet if Phantom exposes it for dapp connections

Do not mark Phantom as production-supported based only on successful wallet discovery or viewing Robinhood Chain in Phantom. A complete connect → switch → approve → bet → receipt flow must pass.

## Responsive UI — required

Test at minimum widths 320, 360, 375, 390, 412, and 430 CSS px.

- No horizontal page scroll.
- Connect button remains reachable with long wallet names.
- Wallet modal is not obscured by the page layout.
- Wager input does not trigger unwanted iOS zoom.
- All betting controls have touch targets of at least ~44px.
- Ticket, burn modes, status text, and errors remain readable above the mobile browser chrome/safe area.
- Double taps do not submit duplicate transactions while a request is pending.
