import { decodeFunctionData, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";

import { assertHex32, VOTING_CONTRACT_ABI } from "../contracts/voting-contract";
import type { EthereumProvider } from "../wallet/metamask";
import {
  createVoteTransactionData,
  getVoteErrorMessage,
  readCandidateVotes,
  readHasVoted,
  sendVoteTransaction,
  waitForTransactionReceipt,
} from "./vote-transaction";

const ELECTION_ID = assertHex32(
  "0x1111111111111111111111111111111111111111111111111111111111111111",
);
const CANDIDATE_ID = assertHex32(
  "0x2222222222222222222222222222222222222222222222222222222222222222",
);
const CONTRACT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VOTER_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TRANSACTION_HASH = assertHex32(
  "0x9999999999999999999999999999999999999999999999999999999999999999",
);

const createProvider = (
  handler: EthereumProvider["request"],
) =>
  ({
    isMetaMask: true,
    request: handler,
  }) satisfies EthereumProvider;

describe("vote transaction helpers", () => {
  it("encodes the SepoliaVoting vote function call", () => {
    const data = createVoteTransactionData(ELECTION_ID, CANDIDATE_ID);
    const decoded = decodeFunctionData({
      abi: VOTING_CONTRACT_ABI,
      data,
    });

    expect(decoded).toEqual({
      args: [ELECTION_ID, CANDIDATE_ID],
      functionName: "vote",
    });
  });

  it("sends a MetaMask transaction to the configured voting contract", async () => {
    let params: unknown;
    const provider = createProvider(async ({ method, params: nextParams }) => {
      expect(method).toBe("eth_sendTransaction");
      params = nextParams;

      return TRANSACTION_HASH;
    });

    await expect(
      sendVoteTransaction(provider, {
        candidateId: CANDIDATE_ID,
        contractAddress: CONTRACT_ADDRESS,
        electionId: ELECTION_ID,
        voterAddress: VOTER_ADDRESS,
      }),
    ).resolves.toBe(TRANSACTION_HASH);
    expect(params).toMatchObject([
      {
        from: VOTER_ADDRESS,
        to: CONTRACT_ADDRESS,
        value: "0x0",
      },
    ]);
  });

  it("rejects invalid MetaMask transaction hashes", async () => {
    const provider = createProvider(async () => "0x1234");

    await expect(
      sendVoteTransaction(provider, {
        candidateId: CANDIDATE_ID,
        contractAddress: CONTRACT_ADDRESS,
        electionId: ELECTION_ID,
        voterAddress: VOTER_ADDRESS,
      }),
    ).rejects.toThrow("MetaMask returned an invalid transaction hash");
  });

  it("waits until MetaMask returns a transaction receipt", async () => {
    let calls = 0;
    const provider = createProvider(async () => {
      calls += 1;

      return calls === 1 ? null : { status: "0x1", transactionHash: TRANSACTION_HASH };
    });

    await expect(
      waitForTransactionReceipt(provider, TRANSACTION_HASH, {
        intervalMs: 0,
        maxAttempts: 2,
      }),
    ).resolves.toEqual({ status: "0x1", transactionHash: TRANSACTION_HASH });
  });

  it("rejects transaction receipts that do not include status", async () => {
    const provider = createProvider(async () => ({ transactionHash: TRANSACTION_HASH }));

    await expect(
      waitForTransactionReceipt(provider, TRANSACTION_HASH, {
        intervalMs: 0,
        maxAttempts: 1,
      }),
    ).rejects.toThrow("MetaMask returned a transaction receipt without status");
  });

  it("reads onchain voter and candidate state with eth_call", async () => {
    const provider = createProvider(async ({ method, params }) => {
      expect(method).toBe("eth_call");
      const call = Array.isArray(params) ? params[0] : undefined;
      const data = (call as { data?: `0x${string}` }).data;
      if (!data) {
        throw new Error("missing eth_call data");
      }
      const decoded = decodeFunctionData({ abi: VOTING_CONTRACT_ABI, data });

      if (decoded.functionName === "hasVoted") {
        return encodeFunctionResult({
          abi: VOTING_CONTRACT_ABI,
          functionName: "hasVoted",
          result: true,
        });
      }

      return encodeFunctionResult({
        abi: VOTING_CONTRACT_ABI,
        functionName: "getCandidateVotes",
        result: BigInt(7),
      });
    });

    await expect(
      readHasVoted(provider, CONTRACT_ADDRESS, ELECTION_ID, VOTER_ADDRESS),
    ).resolves.toBe(true);
    await expect(
      readCandidateVotes(provider, CONTRACT_ADDRESS, ELECTION_ID, CANDIDATE_ID),
    ).resolves.toBe(BigInt(7));
  });

  it("normalizes common MetaMask vote errors", () => {
    expect(getVoteErrorMessage(Object.assign(new Error("denied"), { code: 4001 }))).toBe(
      "User rejected the MetaMask transaction.",
    );
    expect(getVoteErrorMessage(new Error("insufficient funds for gas"))).toBe(
      "Sepolia ETH is required to pay gas for the vote transaction.",
    );
  });
});
