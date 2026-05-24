import { decodeFunctionResult, encodeFunctionData } from "viem";

import {
  assertAddress,
  assertHex32,
  VOTING_CONTRACT_ABI,
  type CandidateId,
  type ElectionId,
  type Hex32,
} from "../contracts/voting-contract";
import type { EthereumProvider } from "../wallet/metamask";

export type VoteTransactionReceipt = Readonly<{
  status: "0x0" | "0x1";
  transactionHash?: Hex32;
}>;

export type SendVoteTransactionInput = Readonly<{
  candidateId: CandidateId;
  contractAddress: `0x${string}`;
  electionId: ElectionId;
  voterAddress: `0x${string}`;
}>;

export type CandidateVoteCount = Readonly<{
  candidateId: CandidateId;
  votes: bigint;
}>;

export const getVotingContractAddress = () => {
  const value = process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS?.trim();

  if (!value) {
    return null;
  }

  return assertAddress(
    value.toLowerCase(),
    "NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS",
  );
};

export const createVoteTransactionData = (
  electionIdValue: string,
  candidateIdValue: string,
) => {
  const electionId = assertHex32(electionIdValue, "electionId");
  const candidateId = assertHex32(candidateIdValue, "candidateId");

  return encodeFunctionData({
    abi: VOTING_CONTRACT_ABI,
    args: [electionId, candidateId],
    functionName: "vote",
  });
};

const normalizeTransactionHash = (value: unknown) => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("MetaMask returned an invalid transaction hash");
  }

  return assertHex32(value.toLowerCase(), "transactionHash");
};

export const sendVoteTransaction = async (
  provider: EthereumProvider,
  input: SendVoteTransactionInput,
) => {
  const transactionHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        data: createVoteTransactionData(input.electionId, input.candidateId),
        from: assertAddress(input.voterAddress.toLowerCase(), "voterAddress"),
        to: assertAddress(input.contractAddress.toLowerCase(), "contractAddress"),
        value: "0x0",
      },
    ],
  });

  return normalizeTransactionHash(transactionHash);
};

export const getTransactionReceipt = async (
  provider: EthereumProvider,
  transactionHash: Hex32,
) => {
  const receipt = await provider.request({
    method: "eth_getTransactionReceipt",
    params: [transactionHash],
  });

  if (receipt === null) {
    return null;
  }
  if (typeof receipt !== "object") {
    throw new Error("MetaMask returned an invalid transaction receipt");
  }

  const status = (receipt as { status?: unknown }).status;
  const receiptHash = (receipt as { transactionHash?: unknown }).transactionHash;

  if (status !== "0x0" && status !== "0x1") {
    throw new Error("MetaMask returned a transaction receipt without status");
  }

  return {
    status,
    transactionHash:
      typeof receiptHash === "string"
        ? normalizeTransactionHash(receiptHash)
        : undefined,
  } satisfies VoteTransactionReceipt;
};

export const waitForTransactionReceipt = async (
  provider: EthereumProvider,
  transactionHash: Hex32,
  options: Readonly<{ intervalMs?: number; maxAttempts?: number }> = {},
) => {
  const intervalMs = options.intervalMs ?? 4_000;
  const maxAttempts = options.maxAttempts ?? 45;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const receipt = await getTransactionReceipt(provider, transactionHash);

    if (receipt) {
      return receipt;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Transaction is still pending. Refresh later to check status.");
};

export const readHasVoted = async (
  provider: EthereumProvider,
  contractAddressValue: string,
  electionIdValue: string,
  voterAddressValue: string,
) => {
  const contractAddress = assertAddress(
    contractAddressValue.toLowerCase(),
    "contractAddress",
  );
  const electionId = assertHex32(electionIdValue, "electionId");
  const voterAddress = assertAddress(voterAddressValue.toLowerCase(), "voterAddress");
  const data = encodeFunctionData({
    abi: VOTING_CONTRACT_ABI,
    args: [electionId, voterAddress],
    functionName: "hasVoted",
  });
  const result = await provider.request({
    method: "eth_call",
    params: [{ data, to: contractAddress }, "latest"],
  });

  if (typeof result !== "string") {
    throw new Error("MetaMask returned an invalid hasVoted response");
  }

  return decodeFunctionResult({
    abi: VOTING_CONTRACT_ABI,
    data: result as `0x${string}`,
    functionName: "hasVoted",
  }) as boolean;
};

export const readCandidateVotes = async (
  provider: EthereumProvider,
  contractAddressValue: string,
  electionIdValue: string,
  candidateIdValue: string,
) => {
  const contractAddress = assertAddress(
    contractAddressValue.toLowerCase(),
    "contractAddress",
  );
  const electionId = assertHex32(electionIdValue, "electionId");
  const candidateId = assertHex32(candidateIdValue, "candidateId");
  const data = encodeFunctionData({
    abi: VOTING_CONTRACT_ABI,
    args: [electionId, candidateId],
    functionName: "getCandidateVotes",
  });
  const result = await provider.request({
    method: "eth_call",
    params: [{ data, to: contractAddress }, "latest"],
  });

  if (typeof result !== "string") {
    throw new Error("MetaMask returned an invalid vote count response");
  }

  return decodeFunctionResult({
    abi: VOTING_CONTRACT_ABI,
    data: result as `0x${string}`,
    functionName: "getCandidateVotes",
  }) as bigint;
};

export const readCandidateVoteCounts = async (
  provider: EthereumProvider,
  contractAddress: string,
  electionId: string,
  candidateIds: readonly CandidateId[],
) =>
  Promise.all(
    candidateIds.map(async (candidateId) => ({
      candidateId,
      votes: await readCandidateVotes(
        provider,
        contractAddress,
        electionId,
        candidateId,
      ),
    })),
  ) satisfies Promise<CandidateVoteCount[]>;

export const getVoteErrorMessage = (error: unknown) => {
  const code = (error as { code?: number }).code;
  const message = error instanceof Error ? error.message : String(error);

  if (code === 4001 || /user rejected/i.test(message)) {
    return "User rejected the MetaMask transaction.";
  }
  if (/insufficient funds|gas required exceeds allowance/i.test(message)) {
    return "Sepolia ETH is required to pay gas for the vote transaction.";
  }
  if (/AlreadyVoted/i.test(message)) {
    return "This wallet has already voted in this election.";
  }
  if (/VotingNotActive/i.test(message)) {
    return "Voting is not active for this election.";
  }

  return message || "Vote transaction failed.";
};
