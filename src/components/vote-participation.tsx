"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import type { CandidateRecord } from "../admin/admin-api";
import type { Hex32 } from "../contracts/voting-contract";
import {
  getElectionTimeStatus,
  isVoteCandidateThresholdMet,
  loadVoteInvitePackage,
  recordVoteTransaction,
  type ElectionTimeStatus,
  type VoteInvitePackage,
  type VoteTransactionStatus,
} from "../vote/voting-api";
import {
  getVoteErrorMessage,
  getVotingContractAddress,
  readCandidateVoteCounts,
  readHasVoted,
  sendVoteTransaction,
  waitForTransactionReceipt,
  type CandidateVoteCount,
} from "../vote/vote-transaction";
import {
  connectMetaMaskWallet,
  formatEthBalance,
  getBalanceStatus,
  getInjectedMetaMaskProvider,
  isSepoliaChain,
  SEPOLIA_FAUCET_URL,
  shortenAddress,
  switchToSepolia,
  type EthereumProvider,
  type WalletConnection,
} from "../wallet/metamask";

type TransactionState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "signing" }>
  | Readonly<{ hash: string; kind: "submitted" }>
  | Readonly<{ hash: string; kind: "success" }>
  | Readonly<{ error: string; kind: "failed"; hash?: string }>;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Voting request failed";
};

const getStatusLabel = (status: ElectionTimeStatus) => {
  if (status === "not_started") {
    return "Not started";
  }
  if (status === "ended") {
    return "Ended";
  }

  return "Active";
};

const getTransactionLabel = (state: TransactionState) => {
  if (state.kind === "signing") {
    return "Waiting for MetaMask signature";
  }
  if (state.kind === "submitted") {
    return "Transaction submitted. Waiting for confirmation.";
  }
  if (state.kind === "success") {
    return "Vote confirmed onchain.";
  }
  if (state.kind === "failed") {
    return state.error;
  }

  return "No vote transaction submitted yet.";
};

const formatDateTime = (value: string) => new Date(value).toLocaleString();

export function VoteParticipation() {
  const [token, setToken] = useState<string | null>(null);
  const [votePackage, setVotePackage] = useState<VoteInvitePackage | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [hasVoted, setHasVoted] = useState<boolean | null>(null);
  const [voteCounts, setVoteCounts] = useState<CandidateVoteCount[]>([]);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onchainWarning, setOnchainWarning] = useState<string | null>(null);
  const [transactionState, setTransactionState] = useState<TransactionState>({
    kind: "idle",
  });

  const contractAddress = getVotingContractAddress();
  const electionStatus = votePackage
    ? getElectionTimeStatus(votePackage.election)
    : null;
  const networkReady = wallet ? isSepoliaChain(wallet.chainId) : false;
  const selectedCandidate = votePackage?.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );
  const candidateThresholdMet = votePackage
    ? isVoteCandidateThresholdMet(votePackage.candidates.length)
    : false;
  const balanceStatus = getBalanceStatus(wallet?.balanceWei);
  const canSubmitVote = Boolean(
    votePackage &&
      selectedCandidate &&
      wallet &&
      provider &&
      contractAddress &&
      networkReady &&
      electionStatus === "active" &&
      candidateThresholdMet &&
      hasVoted === false &&
      transactionState.kind !== "signing" &&
      transactionState.kind !== "submitted" &&
      !isBusy,
  );

  useEffect(() => {
    let cancelled = false;

    const loadInvite = async (inviteToken: string) => {
      setIsLoadingInvite(true);
      setError(null);

      try {
        const loaded = await loadVoteInvitePackage(inviteToken);

        if (cancelled) {
          return;
        }

        setVotePackage(loaded);
        setSelectedCandidateId(loaded.candidates[0]?.candidateId ?? null);
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInvite(false);
        }
      }
    };

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const inviteToken = new URLSearchParams(window.location.search).get("invite");
      setToken(inviteToken);

      if (!inviteToken) {
        setError("Invite token is required to access the voting page.");
        setIsLoadingInvite(false);
        return;
      }

      void loadInvite(inviteToken);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshOnchainState = async (
    currentProvider = provider,
    currentWallet = wallet,
  ) => {
    if (!votePackage || !currentProvider || !currentWallet || !contractAddress) {
      return;
    }

    setOnchainWarning(null);

    try {
      const [nextHasVoted, nextVoteCounts] = await Promise.all([
        readHasVoted(
          currentProvider,
          contractAddress,
          votePackage.election.electionId,
          currentWallet.address,
        ),
        readCandidateVoteCounts(
          currentProvider,
          contractAddress,
          votePackage.election.electionId,
          votePackage.candidates.map((candidate) => candidate.candidateId),
        ),
      ]);

      setHasVoted(nextHasVoted);
      setVoteCounts(nextVoteCounts);
    } catch (nextError) {
      setOnchainWarning(getVoteErrorMessage(nextError));
    }
  };

  const connectWallet = async () => {
    const injectedProvider = getInjectedMetaMaskProvider();

    if (!injectedProvider) {
      setError("MetaMask is required to vote.");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const nextWallet = await connectMetaMaskWallet(injectedProvider);
      setProvider(injectedProvider);
      setWallet(nextWallet);
      await refreshOnchainState(injectedProvider, nextWallet);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const switchNetwork = async () => {
    const injectedProvider = getInjectedMetaMaskProvider();

    if (!injectedProvider) {
      setError("MetaMask is required to switch networks.");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await switchToSepolia(injectedProvider);
      const nextWallet = await connectMetaMaskWallet(injectedProvider);
      setProvider(injectedProvider);
      setWallet(nextWallet);
      await refreshOnchainState(injectedProvider, nextWallet);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const submitVote = async () => {
    if (!votePackage || !wallet || !provider || !selectedCandidate || !contractAddress) {
      setError("Connect MetaMask, select a candidate, and configure the contract first.");
      return;
    }

    setIsBusy(true);
    setError(null);
    setTransactionState({ kind: "signing" });

    let transactionHash: Hex32 | undefined;

    const recordVoteState = async (
      status: VoteTransactionStatus,
      failureReason?: string,
    ) => {
      await recordVoteTransaction({
        candidateId: selectedCandidate.candidateId,
        electionId: votePackage.election.electionId,
        ...(failureReason ? { failureReason } : {}),
        status,
        ...(transactionHash ? { transactionHash } : {}),
        voterWalletAddress: wallet.address,
      }).catch(() => undefined);
    };

    try {
      transactionHash = await sendVoteTransaction(provider, {
        candidateId: selectedCandidate.candidateId,
        contractAddress,
        electionId: votePackage.election.electionId,
        voterAddress: wallet.address,
      });
      setTransactionState({ hash: transactionHash, kind: "submitted" });
      await recordVoteState("submitted");

      const receipt = await waitForTransactionReceipt(provider, transactionHash);

      if (receipt.status === "0x0") {
        setTransactionState({
          error: "Vote transaction reverted onchain.",
          hash: transactionHash,
          kind: "failed",
        });
        await recordVoteState("failed", "Vote transaction reverted onchain.");
        return;
      }

      setTransactionState({ hash: transactionHash, kind: "success" });
      await recordVoteState("success");
      setHasVoted(true);
      await refreshOnchainState(provider, wallet);
    } catch (nextError) {
      const failureReason = getVoteErrorMessage(nextError);
      setTransactionState({
        error: failureReason,
        ...(transactionHash ? { hash: transactionHash } : {}),
        kind: "failed",
      });
      if (transactionHash) {
        await recordVoteState("failed", failureReason);
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-violet-300/20 bg-violet-300/10 p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-violet-100">
            Phase 7 voting flow
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Vote with MetaMask
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-300">
            Validate an invite link, connect a Sepolia wallet, choose one
            candidate, and submit the onchain `vote` transaction yourself.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">Contract</p>
          <p className="mt-1 break-all font-mono">
            {contractAddress ?? "NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS is not set"}
          </p>
        </div>
      </div>

      {isLoadingInvite ? (
        <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
          Validating invite token...
        </p>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {votePackage ? (
        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <div className="space-y-6">
            <ElectionSummary
              candidateCount={votePackage.candidates.length}
              candidateThresholdMet={candidateThresholdMet}
              status={electionStatus ?? "not_started"}
              votePackage={votePackage}
            />

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">Candidates</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Select exactly one candidate. Vote counts are read from the
                    configured contract when available.
                  </p>
                </div>
                <button
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!provider || !wallet || !contractAddress || isBusy}
                  onClick={() => void refreshOnchainState()}
                  type="button"
                >
                  Refresh onchain state
                </button>
              </div>

              {onchainWarning ? (
                <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                  {onchainWarning}
                </p>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {votePackage.candidates.map((candidate) => (
                  <CandidateCard
                    candidate={candidate}
                    key={candidate.candidateId}
                    onSelect={setSelectedCandidateId}
                    selected={candidate.candidateId === selectedCandidateId}
                    votes={
                      voteCounts.find(
                        (voteCount) => voteCount.candidateId === candidate.candidateId,
                      )?.votes
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <WalletVotePanel
              balanceStatus={balanceStatus}
              contractAddress={contractAddress}
              hasVoted={hasVoted}
              isBusy={isBusy}
              networkReady={networkReady}
              onConnect={connectWallet}
              onSwitchNetwork={switchNetwork}
              wallet={wallet}
            />

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <h2 className="text-2xl font-black text-white">Submit vote</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Selected candidate: {selectedCandidate?.name ?? "None"}
              </p>
              <button
                className="mt-5 w-full rounded-full bg-violet-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmitVote}
                onClick={() => void submitVote()}
                type="button"
              >
                Vote on Sepolia
              </button>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
                <p className="font-semibold text-white">Transaction status</p>
                <p className="mt-2">{getTransactionLabel(transactionState)}</p>
                {transactionState.kind === "submitted" ||
                transactionState.kind === "success" ||
                (transactionState.kind === "failed" && transactionState.hash) ? (
                  <p className="mt-2 break-all font-mono text-xs text-slate-400">
                    {"hash" in transactionState ? transactionState.hash : null}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3">
                <a
                  className="rounded-full border border-white/20 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10"
                  href={`/results?electionId=${votePackage.election.electionId}`}
                >
                  View current results
                </a>
                {transactionState.kind === "success" ? (
                  <a
                    className="rounded-full border border-white/20 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10"
                    href={`/verify?electionId=${votePackage.election.electionId}&tx=${transactionState.hash}`}
                  >
                    Verify this vote onchain
                  </a>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {!token && !isLoadingInvite ? (
        <div className="mt-8 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-amber-50">
          Open this page with a valid invite URL: `/vote?invite=&lt;token&gt;`.
        </div>
      ) : null}
    </section>
  );
}

function ElectionSummary({
  candidateCount,
  candidateThresholdMet,
  status,
  votePackage,
}: Readonly<{
  candidateCount: number;
  candidateThresholdMet: boolean;
  status: ElectionTimeStatus;
  votePackage: VoteInvitePackage;
}>) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-100">
        Invite validated
      </p>
      <h2 className="mt-3 text-3xl font-black text-white">
        {votePackage.election.title}
      </h2>
      <p className="mt-3 leading-7 text-slate-300">
        {votePackage.election.description}
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatusPill label="Status" value={getStatusLabel(status)} />
        <StatusPill
          label="Candidates"
          value={`${candidateCount}/2 ${candidateThresholdMet ? "ready" : "minimum"}`}
        />
        <StatusPill label="Invite" value={votePackage.invite.status} />
      </div>
      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
        <p>
          <span className="font-semibold text-white">Start:</span>{" "}
          {formatDateTime(votePackage.election.startAt)}
        </p>
        <p>
          <span className="font-semibold text-white">End:</span>{" "}
          {formatDateTime(votePackage.election.endAt)}
        </p>
        <p className="md:col-span-2">
          <span className="font-semibold text-white">Election ID:</span>{" "}
          <span className="break-all font-mono text-xs">
            {votePackage.election.electionId}
          </span>
        </p>
      </div>
    </div>
  );
}

function StatusPill({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function CandidateCard({
  candidate,
  onSelect,
  selected,
  votes,
}: Readonly<{
  candidate: CandidateRecord;
  onSelect: (candidateId: string) => void;
  selected: boolean;
  votes?: bigint;
}>) {
  return (
    <button
      className={`overflow-hidden rounded-3xl border text-left transition ${
        selected
          ? "border-violet-200 bg-violet-200/15 shadow-lg shadow-violet-950/30"
          : "border-white/10 bg-white/[0.03] hover:border-white/30"
      }`}
      onClick={() => {
        onSelect(candidate.candidateId);
      }}
      type="button"
    >
      <Image
        alt={`${candidate.name} candidate photo`}
        className="h-48 w-full object-cover"
        height={384}
        src={candidate.photoUrl}
        unoptimized
        width={768}
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-black text-white">{candidate.name}</p>
            <p className="mt-1 text-sm text-slate-400">
              Current votes: {votes === undefined ? "not loaded" : votes.toString()}
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-violet-100">
            {selected ? "Selected" : "Select"}
          </span>
        </div>
        <p className="mt-4 break-all font-mono text-xs text-slate-500">
          {candidate.candidateId}
        </p>
      </div>
    </button>
  );
}

function WalletVotePanel({
  balanceStatus,
  contractAddress,
  hasVoted,
  isBusy,
  networkReady,
  onConnect,
  onSwitchNetwork,
  wallet,
}: Readonly<{
  balanceStatus: "available" | "empty" | "unknown";
  contractAddress: `0x${string}` | null;
  hasVoted: boolean | null;
  isBusy: boolean;
  networkReady: boolean;
  onConnect: () => Promise<void>;
  onSwitchNetwork: () => Promise<void>;
  wallet: WalletConnection | null;
}>) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <h2 className="text-2xl font-black text-white">Wallet readiness</h2>
      <div className="mt-5 grid gap-3">
        <StatusPill
          label="Wallet"
          value={wallet ? shortenAddress(wallet.address) : "Not connected"}
        />
        <StatusPill label="Network" value={networkReady ? "Sepolia" : "Required"} />
        <StatusPill
          label="Balance"
          value={
            wallet?.balanceWei === undefined
              ? "Unknown"
              : formatEthBalance(wallet.balanceWei)
          }
        />
        <StatusPill
          label="Onchain vote"
          value={hasVoted === null ? "Not checked" : hasVoted ? "Already voted" : "Open"}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          className="rounded-full bg-violet-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={() => void onConnect()}
          type="button"
        >
          {wallet ? "Reconnect wallet" : "Connect MetaMask"}
        </button>
        <button
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !wallet || networkReady}
          onClick={() => void onSwitchNetwork()}
          type="button"
        >
          Switch to Sepolia
        </button>
      </div>

      {balanceStatus === "empty" ? (
        <a
          className="mt-4 block rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100 underline-offset-4 hover:underline"
          href={SEPOLIA_FAUCET_URL}
          rel="noreferrer"
          target="_blank"
        >
          Sepolia ETH is required for gas. Open a faucet.
        </a>
      ) : null}

      {!contractAddress ? (
        <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
          Voting is disabled until `NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS` points
          to the deployed Sepolia contract.
        </p>
      ) : null}
    </div>
  );
}
