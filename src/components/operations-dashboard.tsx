"use client";

import { useState } from "react";

import {
  getVotingApiBaseUrl,
  loadOperationsSummary,
  type OperationsSummary,
  type VoteRecord,
} from "../admin/admin-api";
import {
  connectMetaMaskWallet,
  getInjectedMetaMaskProvider,
  isSepoliaChain,
  signAdminMessage,
  shortenAddress,
  switchToSepolia,
  type EthereumProvider,
  type WalletConnection,
} from "../wallet/metamask";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Operations request failed";

const formatDateTime = (value: string) => new Date(value).toLocaleString();

export function OperationsDashboard() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const networkReady = wallet ? isSepoliaChain(wallet.chainId) : false;
  const failedCount = summary?.failedVoteRecords.length ?? 0;

  const connectOperatorWallet = async () => {
    const injectedProvider = getInjectedMetaMaskProvider();

    if (!injectedProvider) {
      setError("MetaMask is required for operator views");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const nextWallet = await connectMetaMaskWallet(injectedProvider);
      setProvider(injectedProvider);
      setWallet(nextWallet);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const switchOperatorNetwork = async () => {
    const injectedProvider = getInjectedMetaMaskProvider();

    if (!injectedProvider) {
      setError("MetaMask is required for operator views");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await switchToSepolia(injectedProvider);
      const nextWallet = await connectMetaMaskWallet(injectedProvider);
      setProvider(injectedProvider);
      setWallet(nextWallet);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const refreshSummary = async () => {
    if (!wallet) {
      setError("Connect an operator wallet first");
      return;
    }

    const currentProvider = provider ?? getInjectedMetaMaskProvider();

    if (!currentProvider) {
      setError("MetaMask is required to sign operator requests");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const nextSummary = await loadOperationsSummary(wallet.address, (message) =>
        signAdminMessage(currentProvider, wallet.address, message),
      );
      setSummary(nextSummary);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-fuchsia-300/20 bg-fuchsia-300/10 p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fuchsia-100">
            Phase 9 operations
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Monitor elections and logs
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-300">
            Review all KV election metadata, advisory vote transaction records,
            failed transaction states, and audit logs. Vote counts remain sourced
            from the Sepolia contract.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">API</p>
          <p className="mt-1 break-all">{getVotingApiBaseUrl()}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-full bg-fuchsia-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={connectOperatorWallet}
          type="button"
        >
          {wallet ? "Reconnect operator wallet" : "Connect operator wallet"}
        </button>
        <button
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !wallet || networkReady}
          onClick={switchOperatorNetwork}
          type="button"
        >
          Switch to Sepolia
        </button>
        <button
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !wallet}
          onClick={refreshSummary}
          type="button"
        >
          Refresh operations view
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <OperationsCard
          label="Operator wallet"
          value={wallet ? shortenAddress(wallet.address) : "Not connected"}
        />
        <OperationsCard label="Elections" value={String(summary?.elections.length ?? 0)} />
        <OperationsCard label="Failed tx records" value={String(failedCount)} />
        <OperationsCard label="Audit logs" value={String(summary?.auditLogs.length ?? 0)} />
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <h2 className="text-2xl font-black text-white">Election inventory</h2>
              <div className="mt-4 grid gap-3">
                {summary.elections.length > 0 ? (
                  summary.elections.map((item) => (
                    <div
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      key={item.election.electionId}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-lg font-black text-white">
                            {item.election.title}
                          </p>
                          <p className="mt-1 break-all font-mono text-xs text-slate-400">
                            {item.election.electionId}
                          </p>
                        </div>
                        <a
                          className="rounded-full border border-white/20 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-white/10"
                          href={`/results?electionId=${item.election.electionId}`}
                        >
                          View results
                        </a>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                        <Metric label="Candidates" value={item.candidateCount} />
                        <Metric label="Invites" value={item.inviteCount} />
                        <Metric label="Failed tx" value={item.failedVoteCount} />
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        Vote records: {item.voteRecordCount} total, {item.successfulVoteCount} success, {item.submittedVoteCount} submitted
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-300">No elections found in KV.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <h2 className="text-2xl font-black text-white">Failed transactions</h2>
              <div className="mt-4 grid gap-3">
                {summary.failedVoteRecords.length > 0 ? (
                  summary.failedVoteRecords.map((record) => (
                    <FailedVoteRecordCard key={record.recordId} record={record} />
                  ))
                ) : (
                  <p className="text-sm text-slate-300">No failed vote records found.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <h2 className="text-2xl font-black text-white">Audit log</h2>
            <div className="mt-4 grid gap-3">
              {summary.auditLogs.length > 0 ? (
                summary.auditLogs.map((log) => (
                  <div
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm"
                    key={log.logId}
                  >
                    <p className="font-black text-white">{log.action}</p>
                    <p className="mt-1 text-slate-300">
                      {log.targetType} {log.targetId}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-400">
                      Actor {log.actorWalletAddress}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-300">No audit logs found.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
          Connect an operator wallet and refresh the operations view.
        </p>
      )}
    </section>
  );
}

function OperationsCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm font-semibold text-slate-400">{label}</p>
      <p className="mt-3 break-all text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function FailedVoteRecordCard({ record }: Readonly<{ record: VoteRecord }>) {
  return (
    <div className="rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-50">
      <p className="font-black">{record.failureReason ?? "Vote transaction failed"}</p>
      <p className="mt-2 break-all font-mono text-xs opacity-80">
        Election {record.electionId}
      </p>
      <p className="mt-1 break-all font-mono text-xs opacity-80">
        Candidate {record.candidateId}
      </p>
      {record.transactionHash ? (
        <p className="mt-1 break-all font-mono text-xs opacity-80">
          Tx {record.transactionHash}
        </p>
      ) : null}
      <p className="mt-2 text-xs opacity-70">{formatDateTime(record.createdAt)}</p>
    </div>
  );
}
