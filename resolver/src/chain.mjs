import {
  createPublicClient, createWalletClient, http, keccak256, stringToHex,
  parseAbi
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.mjs";

const abi = parseAbi([
  "function createGame(bytes32 externalKey,uint64 lockTime,string homeTeam,string awayTeam) returns (uint256)",
  "function gameByExternalKey(bytes32) view returns (uint256)",
  "function proposeResult(uint256 gameId,uint8 outcome)",
  "function finalizeResult(uint256 gameId)",
  "function disputeWindow() view returns (uint64)",
  "function gameState(uint256 gameId) view returns (uint64 lockTime,uint64 proposedAt,uint8 status,uint8 proposedOutcome,uint8 finalOutcome)"
]);

const chain = {
  id: config.chainId,
  name: config.chainId === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
};

export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

function wallet() {
  const account = privateKeyToAccount(config.privateKey);
  return createWalletClient({ account, chain, transport: http(config.rpcUrl) });
}

export function externalKey(sportKey, eventId) {
  return keccak256(stringToHex(`${sportKey}|${eventId}`));
}

export async function getGameIdByKey(key) {
  return publicClient.readContract({ address: config.poolAddress, abi, functionName: "gameByExternalKey", args: [key] });
}

export async function createGameOnchain({ key, lockTime, homeTeam, awayTeam }) {
  const w = wallet();
  const hash = await w.writeContract({ address: config.poolAddress, abi, functionName: "createGame", args: [key, BigInt(lockTime), homeTeam, awayTeam] });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash, gameId: await getGameIdByKey(key) };
}

export async function proposeResultOnchain(gameId, outcome) {
  const w = wallet();
  const hash = await w.writeContract({ address: config.poolAddress, abi, functionName: "proposeResult", args: [BigInt(gameId), outcome] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function finalizeOnchain(gameId) {
  const w = wallet();
  const hash = await w.writeContract({ address: config.poolAddress, abi, functionName: "finalizeResult", args: [BigInt(gameId)] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function readGameState(gameId) {
  return publicClient.readContract({ address: config.poolAddress, abi, functionName: "gameState", args: [BigInt(gameId)] });
}

export async function readDisputeWindow() {
  return publicClient.readContract({ address: config.poolAddress, abi, functionName: "disputeWindow" });
}
