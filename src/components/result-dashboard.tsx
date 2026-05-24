"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { CandidateRecord, ElectionRecord } from "../admin/admin-api";
import type { Hex32 } from "../contracts/voting-contract";
import {
  createResultPublicClient,
  getElectionStatusLabel,
  getEtherscanAddressUrl,
  getEtherscanTransactionUrl,
  getResultContractAddress,
  mergeResultRows,
  readOnchainResultSnapshot,
  summarizeResults,
  type OnchainResultSnapshot,
  type ResultRow,
  type ResultSummary,
} from "../results/onchain-results";
import {
  createResultShareUrl,
  createVerificationUrl,
  loadResultMetadataPackage,
  normalizeOptionalTransactionHash,
  normalizeResultElectionId,
} from "../results/results-api";

type ResultMode = "results" | "verify";

type LoadState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ error: string; kind: "failed" }>
  | Readonly<{
      candidates: CandidateRecord[];
      election: ElectionRecord;
      kind: "loaded";
      snapshot: OnchainResultSnapshot | null;
      summary: ResultSummary | null;
      txHash: Hex32 | null;
    }>;

const formatDateTime = (value: string) => new Date(value).toLocaleString();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Result lookup failed";
};

const formatVotes = (votes: bigint) => `${votes.toString()} votes`;

const createLoadedResultState = async (
  electionId: Hex32,
  txHash: Hex32 | null,
  contractAddress: `0x${string}` | null,
): Promise<LoadState> => {
  const metadata = await loadResultMetadataPackage(electionId);
  const snapshot = contractAddress
    ? await readOnchainResultSnapshot(
        createResultPublicClient(),
        contractAddress,
        electionId,
      )
    : null;
  const rows = snapshot ? mergeResultRows(metadata.candidates, snapshot) : null;

  return {
    ...metadata,
    kind: "loaded",
    snapshot,
    summary: rows ? summarizeResults(rows) : null,
    txHash,
  };
};

export function ResultDashboard({ mode }: Readonly<{ mode: ResultMode }>) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const contractAddress = getResultContractAddress();
  const title = mode === "verify" ? "Onchain verification" : "Election results";

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      try {
        const searchParams = new URLSearchParams(window.location.search);
        const electionId = normalizeResultElectionId(searchParams.get("electionId"));
        const txHash = normalizeOptionalTransactionHash(searchParams.get("tx"));

        setState({ kind: "loading" });
        void createLoadedResultState(electionId, txHash, contractAddress)
          .then((nextState) => {
            if (!cancelled) {
              setState(nextState);
            }
          })
          .catch((error: unknown) => {
            if (!cancelled) {
              setState({ error: getErrorMessage(error), kind: "failed" });
            }
          });
      } catch (error) {
        setState({ error: getErrorMessage(error), kind: "failed" });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [contractAddress]);

  const refreshOnchain = async () => {
    if (state.kind !== "loaded" || !contractAddress) {
      return;
    }

    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const snapshot = await readOnchainResultSnapshot(
        createResultPublicClient(),
        contractAddress,
        state.election.electionId,
      );
      const rows = mergeResultRows(state.candidates, snapshot);

      setState({
        ...state,
        snapshot,
        summary: summarizeResults(rows),
      });
    } catch (error) {
      setRefreshError(getErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyResultLink = async () => {
    if (state.kind !== "loaded") {
      return;
    }

    const href =
      mode === "verify"
        ? createVerificationUrl(window.location.origin, state.election.electionId)
        : createResultShareUrl(window.location.origin, state.election.electionId);
    await navigator.clipboard.writeText(href);
    setCopied(true);
  };

  return (
    <section className="rounded-[2rem] border border-sky-300/20 bg-sky-300/10 p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-100">
            Phase 8 result lookup
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-300">
            Results are read from the Sepolia voting contract and matched with
            Workers KV candidate metadata by `candidateId`.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">Read source</p>
          <p className="mt-1 break-all font-mono">
            {contractAddress ?? "NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS is not set"}
          </p>
          <p className="mt-2 text-xs text-slate-500">Sepolia RPC configured client-side</p>
        </div>
      </div>

      {state.kind === "loading" || state.kind === "idle" ? (
        <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
          Loading election metadata and onchain results...
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <div className="mt-6 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          <p>{state.error}</p>
          <p className="mt-2 text-red-100/80">
            Open this page with `/results?electionId=&lt;bytes32&gt;` or
            `/verify?electionId=&lt;bytes32&gt;`.
          </p>
        </div>
      ) : null}

      {state.kind === "loaded" ? (
        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <div className="space-y-6">
            <ElectionResultHeader
              contractAddress={contractAddress}
              election={state.election}
              isRefreshing={isRefreshing}
              onCopy={copyResultLink}
              onRefresh={refreshOnchain}
              snapshot={state.snapshot}
              summary={state.summary}
            />

            {refreshError ? (
              <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                Refresh failed: {refreshError}. Existing result data is still shown.
              </p>
            ) : null}

            {state.summary ? (
              <ResultTable rows={state.summary.rows} status={state.snapshot?.status} />
            ) : (
              <MissingContractNotice />
            )}
          </div>

          <aside className="space-y-6">
            <WinnerPanel snapshot={state.snapshot} summary={state.summary} />
            <VerificationPanel
              contractAddress={contractAddress}
              election={state.election}
              snapshot={state.snapshot}
              txHash={state.txHash}
            />
            {copied ? (
              <p className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100">
                Share link copied.
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function ElectionResultHeader({
  contractAddress,
  election,
  isRefreshing,
  onCopy,
  onRefresh,
  snapshot,
  summary,
}: Readonly<{
  contractAddress: `0x${string}` | null;
  election: ElectionRecord;
  isRefreshing: boolean;
  onCopy: () => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: OnchainResultSnapshot | null;
  summary: ResultSummary | null;
}>) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">
        {snapshot ? getElectionStatusLabel(snapshot.status) : "Metadata loaded"}
      </p>
      <h2 className="mt-3 text-3xl font-black text-white">{election.title}</h2>
      <p className="mt-3 leading-7 text-slate-300">{election.description}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Metric label="Total votes" value={summary?.totalVotes.toString() ?? "--"} />
        <Metric label="Candidates" value={`${summary?.rows.length ?? 0}`} />
        <Metric
          label="Last onchain sync"
          value={snapshot ? formatDateTime(snapshot.syncedAt) : "Not available"}
        />
      </div>
      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
        <p>
          <span className="font-semibold text-white">Start:</span>{" "}
          {formatDateTime(election.startAt)}
        </p>
        <p>
          <span className="font-semibold text-white">End:</span>{" "}
          {formatDateTime(election.endAt)}
        </p>
        <p className="md:col-span-2">
          <span className="font-semibold text-white">Election ID:</span>{" "}
          <span className="break-all font-mono text-xs">{election.electionId}</span>
        </p>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-full bg-sky-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!contractAddress || isRefreshing}
          onClick={() => void onRefresh()}
          type="button"
        >
          Refresh from onchain
        </button>
        <button
          className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          onClick={() => void onCopy()}
          type="button"
        >
          Copy share link
        </button>
      </div>
    </div>
  );
}

function ResultTable({
  rows,
  status,
}: Readonly<{ rows: readonly ResultRow[]; status?: number }>) {
  const maxVotes = rows.reduce(
    (max, row) => (row.votes > max ? row.votes : max),
    BigInt(0),
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <h2 className="text-2xl font-black text-white">
        {status === 3 ? "Final result" : "Current vote count"}
      </h2>
      <div className="mt-5 grid gap-4">
        {rows.map((row) => (
          <div
            className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[8rem_1fr]"
            key={row.candidateId}
          >
            {row.candidate ? (
              <Image
                alt={`${row.candidate.name} candidate photo`}
                className="h-32 w-full rounded-2xl object-cover"
                height={256}
                src={row.candidate.photoUrl}
                unoptimized
                width={256}
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xs text-slate-400">
                No KV metadata
              </div>
            )}
            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-2xl font-black text-white">
                    {row.candidate?.name ?? "Unknown onchain candidate"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatVotes(row.votes)}
                  </p>
                </div>
                {maxVotes > BigInt(0) &&
                row.votes === maxVotes &&
                row.metadataStatus !== "missing_onchain_candidate" ? (
                  <span className="rounded-full border border-sky-200/30 bg-sky-200/10 px-3 py-1 text-xs font-bold text-sky-100">
                    Leader
                  </span>
                ) : null}
              </div>
              <p className="mt-4 break-all font-mono text-xs text-slate-500">
                {row.candidateId}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Mapping: {row.metadataStatus.replaceAll("_", " ")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WinnerPanel({
  snapshot,
  summary,
}: Readonly<{
  snapshot: OnchainResultSnapshot | null;
  summary: ResultSummary | null;
}>) {
  if (!summary || !snapshot) {
    return <MissingContractNotice />;
  }

  const label = snapshot.status === 3 ? "Winner" : "Current leader";

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <h2 className="text-2xl font-black text-white">{label}</h2>
      <div className="mt-4 space-y-3">
        {summary.winners.length > 0 ? (
          summary.winners.map((winner) => (
          <div
            className="rounded-2xl border border-sky-200/20 bg-sky-200/10 p-4"
            key={winner.candidateId}
          >
            <p className="text-xl font-black text-white">
              {winner.candidate?.name ?? winner.candidateId}
            </p>
            <p className="mt-1 text-sm text-sky-100">{formatVotes(winner.votes)}</p>
          </div>
          ))
        ) : (
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
            No votes have been recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

function VerificationPanel({
  contractAddress,
  election,
  snapshot,
  txHash,
}: Readonly<{
  contractAddress: `0x${string}` | null;
  election: ElectionRecord;
  snapshot: OnchainResultSnapshot | null;
  txHash: Hex32 | null;
}>) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <h2 className="text-2xl font-black text-white">Onchain verification</h2>
      <div className="mt-4 space-y-4 text-sm text-slate-300">
        <VerificationLine label="Election ID" value={election.electionId} />
        <VerificationLine
          label="Contract"
          value={contractAddress ?? "Not configured"}
        />
        <VerificationLine
          label="Onchain status"
          value={snapshot ? getElectionStatusLabel(snapshot.status) : "Not available"}
        />
        <VerificationLine
          label="Candidate IDs"
          value={snapshot?.candidateIds.join(", ") ?? "Not available"}
        />
        {txHash ? <VerificationLine label="Transaction hash" value={txHash} /> : null}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {contractAddress ? (
          <a
            className="rounded-full border border-white/20 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10"
            href={getEtherscanAddressUrl(contractAddress)}
            rel="noreferrer"
            target="_blank"
          >
            Open contract on Sepolia explorer
          </a>
        ) : null}
        {txHash ? (
          <a
            className="rounded-full border border-white/20 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10"
            href={getEtherscanTransactionUrl(txHash)}
            rel="noreferrer"
            target="_blank"
          >
            Open transaction on Sepolia explorer
          </a>
        ) : null}
      </div>
    </div>
  );
}

function VerificationLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <p>
      <span className="font-semibold text-white">{label}:</span>{" "}
      <span className="break-all font-mono text-xs">{value}</span>
    </p>
  );
}

function MissingContractNotice() {
  return (
    <div className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm text-amber-100">
      Configure `NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS` after Sepolia deployment to
      read current and final vote counts from the smart contract.
    </div>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-black text-white">{value}</p>
    </div>
  );
}
