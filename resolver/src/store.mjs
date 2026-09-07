import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, "../data/runtime-markets.json");

export async function loadMarkets() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}

export async function saveMarkets(rows) {
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2) + "\n");
}
