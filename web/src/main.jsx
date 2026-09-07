import React from "react";
import { createRoot } from "react-dom/client";
import { AppShell, demoAccount } from "./AppShell.jsx";
import { CHAIN_ID, LOCAL_DEMO, Web3Provider } from "./wallet.jsx";
import "./styles.css";

function LocalApp() {
  const session = {
    address: demoAccount?.address,
    isConnected: Boolean(demoAccount),
    accountStatus: "connected",
    walletProvider: null,
    chainId: CHAIN_ID,
    walletName: "Local Demo",
    isPhantom: false,
    openConnect: async () => {},
    openAccount: async () => {},
    switchNetwork: async () => {},
  };
  return <AppShell session={session} />;
}

async function boot() {
  if (LOCAL_DEMO) {
    createRoot(document.getElementById("root")).render(<LocalApp />);
    return;
  }
  const { RemoteApp } = await import("./RemoteApp.jsx");
  createRoot(document.getElementById("root")).render(
    <Web3Provider>
      <RemoteApp />
    </Web3Provider>,
  );
}

boot();
