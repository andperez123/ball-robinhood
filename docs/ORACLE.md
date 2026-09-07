# Automated oracle design

## Objective
No operator manually types winners during normal operation.

## Creation
1. Poll The Odds API `/v4/sports/{sport}/events`.
2. Filter to configured leagues and lookahead window.
3. Hash `sportKey|eventId` into the onchain external key.
4. Create an OPEN BallPool game with lock time shortly before scheduled start.
5. Persist provider IDs + onchain game ID.

## Resolution
1. Poll The Odds API score endpoint for the canonical event ID.
2. Require `completed=true` and numeric home/away scores.
3. Search the same event in TheSportsDB by team names + date.
4. Require a final/finished status and numeric scores.
5. Require exact score agreement.
6. If they disagree, do nothing and mark `needs_review`.
7. If tied, do nothing in V0 and mark `needs_review` (two-outcome market cannot express a tie).
8. Oracle wallet calls `proposeResult`.
9. Wait the onchain dispute window.
10. Any account can call `finalizeResult`; the bot does it automatically too.

## Failure philosophy
No consensus = no settlement. Availability may degrade; correctness should not.

## Key risk
The oracle wallet is authorized to create markets and propose results. It cannot directly withdraw pool funds, but a compromised key could propose a false outcome. Mitigations before mainnet:
- separate deployer/owner/oracle keys
- owner behind multisig
- short-lived funded resolver key
- monitoring on ResultProposed events
- dispute-window alerting
- automatic pause/invalidate runbook
- consider threshold signatures or an oracle quorum contract for V1.1
