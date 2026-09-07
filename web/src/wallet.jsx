import React from "react";
import { createAppKit } from "@reown/appkit/react";
import { defineChain } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 46630);
export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || (
  CHAIN_ID === 4663
    ? "https://robinhoodchain.blockscout.com"
    : "https://explorer.testnet.chain.robinhood.com"
);

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: "eip155",
  name: CHAIN_ID === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: EXPLORER_URL },
  },
});

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "REPLACE_WITH_REOWN_PROJECT_ID";
export const walletConnectConfigured = projectId !== "REPLACE_WITH_REOWN_PROJECT_ID";
const appUrl = import.meta.env.VITE_APP_URL || (typeof window !== "undefined" ? window.location.origin : "https://example.com");

const metadata = {
  name: "$BALL",
  description: "Sports will destroy this token.",
  url: appUrl,
  icons: [],
};

const networks = [robinhoodChain];
export const wagmiAdapter = new WagmiAdapter({ networks, projectId, ssr: false });

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  defaultNetwork: robinhoodChain,
  customRpcUrls: { [`eip155:${CHAIN_ID}`]: RPC_URL },
  features: { analytics: false },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});

export function Web3Provider({ children }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
