#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function run(command, args, { cwd = root, env = process.env, name } = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  children.push(child);
  const label = name || command;
  child.stdout.on("data", (buf) => process.stdout.write(`[${label}] ${buf}`));
  child.stderr.on("data", (buf) => process.stderr.write(`[${label}] ${buf}`));
  child.on("exit", (code, signal) => {
    if (signal) console.error(`[${label}] killed by ${signal}`);
    else if (code && code !== 0) console.error(`[${label}] exited ${code}`);
  });
  return child;
}

async function waitForRpc(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.result) return body.result;
      }
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error(`Hardhat RPC not ready at ${url}`);
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  console.log("Starting Hardhat node on http://127.0.0.1:8545 …");
  run("npx", ["hardhat", "node", "--hostname", "127.0.0.1", "--port", "8545"], {
    cwd: path.join(root, "contracts"),
    name: "hardhat",
  });

  await waitForRpc("http://127.0.0.1:8545");
  console.log("Deploying + seeding local BallPool …");

  await new Promise((resolve, reject) => {
    const deploy = spawn(
      "npx",
      ["hardhat", "run", "scripts/deploy-local.js", "--network", "localhost"],
      { cwd: path.join(root, "contracts"), stdio: "inherit", shell: false },
    );
    deploy.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`deploy-local exited ${code}`))));
  });

  console.log("Starting web UI on http://localhost:5173 …");
  run("npm", ["--workspace", "web", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"], {
    name: "web",
  });

  console.log("\nLocal demo ready:");
  console.log("  UI:     http://localhost:5173");
  console.log("  RPC:    http://127.0.0.1:8545 (chain 31337)");
  console.log("  Wallet: built-in Hardhat demo account (auto-connected)\n");
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
