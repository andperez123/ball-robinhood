import React from "react";
import { createAppKit } from "@reown/appkit/react";
import { defineChain } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

export const LOCAL_DEMO = import.meta.env.VITE_LOCAL_DEMO === "true";
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || (LOCAL_DEMO ? 31337 : 46630));
export const RPC_URL = import.meta.env.VITE_RPC_URL || (
  LOCAL_DEMO ? "http://127.0.0.1:8545" : "https://rpc.testnet.chain.robinhood.com"
);
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || (
  CHAIN_ID === 31337
    ? ""
    : CHAIN_ID === 4663
      ? "https://robinhoodchain.blockscout.com"
      : "https://explorer.testnet.chain.robinhood.com"
);

function chainName(id) {
  if (id === 31337) return "Hardhat Local";
  if (id === 4663) return "Robinhood Chain";
  return "Robinhood Chain Testnet";
}

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: "eip155",
  name: chainName(CHAIN_ID),
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: EXPLORER_URL
    ? { default: { name: "Explorer", url: EXPLORER_URL } }
    : undefined,
});

export const walletConnectConfigured = Boolean(import.meta.env.VITE_REOWN_PROJECT_ID);

let wagmiAdapter = null;
let appKit = null;

if (!LOCAL_DEMO) {
  const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "REPLACE_WITH_REOWN_PROJECT_ID";
  const appUrl = import.meta.env.VITE_APP_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:5173");
  const metadata = {
    name: "$BALL",
    description: "Sports will destroy this token.",
    url: appUrl,
    icons: [],
  };
  const networks = [robinhoodChain];
  const customRpcUrls = {
    [`eip155:${CHAIN_ID}`]: [{ url: RPC_URL }],
  };

  wagmiAdapter = new WagmiAdapter({
    networks,
    projectId,
    ssr: false,
    customRpcUrls,
  });

  appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    defaultNetwork: robinhoodChain,
    customRpcUrls,
    features: { analytics: false },
  });
}

export { wagmiAdapter, appKit };

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});

export function Web3Provider({ children }) {
  if (LOCAL_DEMO || !wagmiAdapter) return children;
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
