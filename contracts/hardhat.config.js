require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Accept only a real 32-byte hex key so .env.example placeholders do not break `hardhat test`.
const rawKey = (process.env.PRIVATE_KEY || "").trim();
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/.test(rawKey) ? rawKey : undefined;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    robinhoodTestnet: {
      url: process.env.RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    robinhood: {
      url: process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
