import React from "react";
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useWalletInfo } from "@reown/appkit/react";
import { AppShell } from "./AppShell.jsx";
import { robinhoodChain } from "./wallet.jsx";

export function RemoteApp() {
  const { open } = useAppKit();
  const { address, isConnected, status: accountStatus } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider("eip155");
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletInfo } = useWalletInfo();

  const session = {
    address,
    isConnected,
    accountStatus,
    walletProvider,
    chainId: chainId ? Number(chainId) : null,
    walletName: walletInfo?.name || "Wallet",
    isPhantom: /phantom/i.test(walletInfo?.name || ""),
    openConnect: () => open({ view: "Connect", namespace: "eip155" }),
    openAccount: () => open({ view: "Account" }),
    switchNetwork: () => switchNetwork(robinhoodChain),
  };

  return <AppShell session={session} />;
}
