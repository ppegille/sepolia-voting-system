"use client";

import { useCallback, useEffect, useState } from "react";

import {
  connectMetaMaskWallet,
  formatEthBalance,
  getBalanceStatus,
  getInjectedMetaMaskProvider,
  isSepoliaChain,
  readMetaMaskWallet,
  SEPOLIA_CHAIN_ID_DECIMAL,
  SEPOLIA_FAUCET_URL,
  shortenAddress,
  switchToSepolia,
  type EthereumProvider,
  type WalletConnection,
} from "../wallet/metamask";

type WalletPhaseStatus = "checking" | "missing" | "ready" | "connected";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "MetaMask request failed";
};

export function WalletStatus() {
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [status, setStatus] = useState<WalletPhaseStatus>("checking");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWallet = useCallback(async (nextProvider: EthereumProvider | null) => {
    if (!nextProvider) {
      return;
    }

    const nextWallet = await readMetaMaskWallet(nextProvider);
    setWallet(nextWallet);
    setStatus(nextWallet ? "connected" : "ready");
    setError(null);
  }, []);

  useEffect(() => {
    const nextProvider = getInjectedMetaMaskProvider();
    let isActive = true;

    const handleAccountsChanged = () => {
      refreshWallet(nextProvider).catch((nextError: unknown) => {
        setError(getErrorMessage(nextError));
      });
    };
    const handleChainChanged = () => {
      refreshWallet(nextProvider).catch((nextError: unknown) => {
        setError(getErrorMessage(nextError));
      });
    };

    const initializeWallet = async () => {
      await Promise.resolve();

      if (!isActive) {
        return;
      }

      if (!nextProvider) {
        setStatus("missing");
        return;
      }

      setProvider(nextProvider);

      try {
        await refreshWallet(nextProvider);
      } catch (nextError) {
        setStatus("ready");
        setError(getErrorMessage(nextError));
      }

      nextProvider.on?.("accountsChanged", handleAccountsChanged);
      nextProvider.on?.("chainChanged", handleChainChanged);
    };

    initializeWallet().catch((nextError: unknown) => {
      setStatus("ready");
      setError(getErrorMessage(nextError));
    });

    return () => {
      isActive = false;
      nextProvider?.removeListener?.("accountsChanged", handleAccountsChanged);
      nextProvider?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refreshWallet]);

  const connectWallet = async () => {
    if (!provider) {
      setStatus("missing");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const nextWallet = await connectMetaMaskWallet(provider);
      setWallet(nextWallet);
      setStatus("connected");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const switchNetwork = async () => {
    if (!provider) {
      setStatus("missing");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await switchToSepolia(provider);
      await refreshWallet(provider);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const networkReady = wallet ? isSepoliaChain(wallet.chainId) : false;
  const balanceStatus = getBalanceStatus(wallet?.balanceWei);
  const balanceText = wallet
    ? wallet.balanceWei === undefined
      ? "Switch to Sepolia to check gas balance"
      : formatEthBalance(wallet.balanceWei)
    : "Wallet not connected";
  const metaMaskState = status === "checking"
    ? "Checking"
    : status === "missing"
      ? "Action required"
      : "Detected";
  const metaMaskTone = status === "missing"
    ? "warning"
    : status === "checking"
      ? "neutral"
      : "success";
  const metaMaskValue = status === "missing"
    ? "Install MetaMask"
    : status === "checking"
      ? "Checking browser wallet"
      : "Browser wallet ready";

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">
            Phase 4 wallet access
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
            MetaMask Sepolia readiness
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-300">
            Connect MetaMask, confirm the Sepolia network, and check whether the
            selected wallet has test ETH before any voting transaction is shown.
          </p>
        </div>

        <span className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100">
          Chain ID {SEPOLIA_CHAIN_ID_DECIMAL}
        </span>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <StatusCard
          label="MetaMask"
          state={metaMaskState}
          tone={metaMaskTone}
          value={metaMaskValue}
        />
        <StatusCard
          label="Connected wallet"
          state={wallet ? "Connected" : "Not connected"}
          tone={wallet ? "success" : "neutral"}
          value={wallet ? shortenAddress(wallet.address) : "Connect to continue"}
        />
        <StatusCard
          label="Sepolia network"
          state={networkReady ? "Ready" : "Needs Sepolia"}
          tone={networkReady ? "success" : "warning"}
          value={wallet ? wallet.chainId : "Connect wallet first"}
        />
      </div>

      <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-400">Balance check</p>
            <p className="mt-1 text-2xl font-bold text-white">
              {balanceText}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {!networkReady && wallet
                ? "Balance is checked only on Sepolia so other-network ETH is never treated as voting gas."
                : balanceStatus === "empty"
                ? "This wallet has no Sepolia ETH. Voting will require gas, so use a faucet before signing a transaction."
                : "Sepolia ETH is used only by the voter wallet for transaction gas."}
            </p>
          </div>
          <a
            className="rounded-full border border-amber-200/40 px-5 py-3 text-center text-sm font-bold text-amber-100 transition hover:bg-amber-200/10"
            href={SEPOLIA_FAUCET_URL}
            rel="noreferrer"
            target="_blank"
          >
            Open Sepolia faucet
          </a>
        </div>
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-full bg-cyan-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || status === "missing" || status === "checking"}
          onClick={connectWallet}
          type="button"
        >
          {wallet ? "Reconnect MetaMask" : "Connect MetaMask"}
        </button>
        <button
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !provider || !wallet || networkReady}
          onClick={switchNetwork}
          type="button"
        >
          Switch to Sepolia
        </button>
        <button
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !provider}
          onClick={() => {
            refreshWallet(provider).catch((nextError: unknown) => {
              setError(getErrorMessage(nextError));
            });
          }}
          type="button"
        >
          Refresh wallet
        </button>
      </div>

      {status === "missing" ? (
        <p className="mt-5 text-sm leading-6 text-slate-300">
          MetaMask is required for MVP voting because every vote will be signed
          directly by the voter wallet on Sepolia.
        </p>
      ) : null}
    </section>
  );
}

function StatusCard({
  label,
  state,
  tone,
  value,
}: Readonly<{
  label: string;
  state: string;
  tone: "neutral" | "success" | "warning";
  value: string;
}>) {
  const toneClass = {
    neutral: "border-slate-500/30 bg-slate-500/10 text-slate-100",
    success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    warning: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <p className="text-sm font-semibold opacity-80">{label}</p>
      <p className="mt-3 text-xl font-black">{state}</p>
      <p className="mt-2 break-all text-sm opacity-80">{value}</p>
    </div>
  );
}
