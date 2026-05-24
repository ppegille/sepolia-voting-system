import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

import type { CandidateRecord } from "../admin/admin-api";
import {
  assertAddress,
  assertHex32,
  ELECTION_STATUS,
  VOTING_CONTRACT_ABI,
  type CandidateId,
  type CandidateResult,
  type ElectionStatus,
} from "../contracts/voting-contract";
import { SEPOLIA_EXPLORER_URL, SEPOLIA_RPC_URLS } from "../wallet/metamask";

export type OnchainResultSnapshot = Readonly<{
  candidateIds: CandidateId[];
  results: CandidateResult[];
  status: ElectionStatus;
  syncedAt: string;
}>;

export type ResultRow = Readonly<{
  candidate: CandidateRecord | null;
  candidateId: CandidateId;
  displayOrder: number;
  metadataStatus: "matched" | "missing_kv_metadata" | "missing_onchain_candidate";
  votes: bigint;
}>;

export type ResultSummary = Readonly<{
  rows: ResultRow[];
  totalVotes: bigint;
  winners: ResultRow[];
}>;

type ContractReader = Readonly<{
  readContract: PublicClient["readContract"];
}>;

export const getSepoliaRpcUrl = () =>
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() || SEPOLIA_RPC_URLS[0];

export const getResultContractAddress = () => {
  const value = process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS?.trim();

  if (!value) {
    return null;
  }

  return assertAddress(
    value.toLowerCase(),
    "NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS",
  );
};

export const createResultPublicClient = (rpcUrl = getSepoliaRpcUrl()) =>
  createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

export const readOnchainResultSnapshot = async (
  reader: ContractReader,
  contractAddressValue: string,
  electionIdValue: string,
  syncedAt: Date = new Date(),
) => {
  const address = assertAddress(contractAddressValue.toLowerCase(), "contractAddress");
  const electionId = assertHex32(electionIdValue, "electionId");
  const [status, candidateIds, results] = await Promise.all([
    reader.readContract({
      abi: VOTING_CONTRACT_ABI,
      address,
      args: [electionId],
      functionName: "getElectionStatus",
    }),
    reader.readContract({
      abi: VOTING_CONTRACT_ABI,
      address,
      args: [electionId],
      functionName: "getCandidates",
    }),
    reader.readContract({
      abi: VOTING_CONTRACT_ABI,
      address,
      args: [electionId],
      functionName: "getElectionResult",
    }),
  ]);

  return {
    candidateIds: candidateIds as CandidateId[],
    results: results as CandidateResult[],
    status: status as ElectionStatus,
    syncedAt: syncedAt.toISOString(),
  } satisfies OnchainResultSnapshot;
};

export const mergeResultRows = (
  candidates: readonly CandidateRecord[],
  snapshot: Pick<OnchainResultSnapshot, "candidateIds" | "results">,
) => {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const votesById = new Map(
    snapshot.results.map((result) => [result.candidateId, result.votes]),
  );
  const onchainCandidateIds = new Set(snapshot.candidateIds);
  const rows: ResultRow[] = snapshot.candidateIds.map((candidateId, index) => {
    const candidate = candidatesById.get(candidateId) ?? null;

    return {
      candidate,
      candidateId,
      displayOrder: candidate?.displayOrder ?? index,
      metadataStatus: candidate ? "matched" : "missing_kv_metadata",
      votes: votesById.get(candidateId) ?? BigInt(0),
    } satisfies ResultRow;
  });

  const missingOnchainRows = candidates
    .filter((candidate) => !onchainCandidateIds.has(candidate.candidateId))
    .map(
      (candidate) =>
        ({
          candidate,
          candidateId: candidate.candidateId,
          displayOrder: candidate.displayOrder,
          metadataStatus: "missing_onchain_candidate",
          votes: BigInt(0),
        }) satisfies ResultRow,
    );

  return [...rows, ...missingOnchainRows].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
};

export const summarizeResults = (rows: readonly ResultRow[]) => {
  const totalVotes = rows.reduce(
    (total, row) => total + row.votes,
    BigInt(0),
  );
  const maxVotes = rows.reduce(
    (max, row) => (row.votes > max ? row.votes : max),
    BigInt(0),
  );
  const winners = rows.filter(
    (row) =>
      rows.length > 0 &&
      maxVotes > BigInt(0) &&
      row.votes === maxVotes &&
      row.metadataStatus !== "missing_onchain_candidate",
  );

  return { rows: [...rows], totalVotes, winners } satisfies ResultSummary;
};

export const getElectionStatusLabel = (status: ElectionStatus) => {
  if (status === ELECTION_STATUS.NotCreated) {
    return "Not created";
  }
  if (status === ELECTION_STATUS.Pending) {
    return "Pending";
  }
  if (status === ELECTION_STATUS.Active) {
    return "Active";
  }

  return "Ended";
};

export const getEtherscanAddressUrl = (addressValue: string) =>
  `${SEPOLIA_EXPLORER_URL}/address/${assertAddress(
    addressValue.toLowerCase(),
    "contractAddress",
  )}`;

export const getEtherscanTransactionUrl = (transactionHashValue: string) =>
  `${SEPOLIA_EXPLORER_URL}/tx/${assertHex32(
    transactionHashValue.toLowerCase(),
    "transactionHash",
  )}`;
