import { afterEach, describe, expect, it, vi } from "vitest";

import { assertHex32, ELECTION_STATUS } from "../contracts/voting-contract";
import {
  getElectionStatusLabel,
  getEtherscanAddressUrl,
  getEtherscanTransactionUrl,
  getSepoliaRpcUrl,
  mergeResultRows,
  readOnchainResultSnapshot,
  summarizeResults,
} from "./onchain-results";

const ELECTION_ID = assertHex32(
  "0x1111111111111111111111111111111111111111111111111111111111111111",
);
const CANDIDATE_ID = assertHex32(
  "0x2222222222222222222222222222222222222222222222222222222222222222",
);
const SECOND_CANDIDATE_ID = assertHex32(
  "0x3333333333333333333333333333333333333333333333333333333333333333",
);
const CONTRACT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_HASH =
  "0x9999999999999999999999999999999999999999999999999999999999999999";

const candidates = [
  {
    candidateId: CANDIDATE_ID,
    createdAt: "2098-01-01T00:00:00.000Z",
    displayOrder: 1,
    electionId: ELECTION_ID,
    metadataHash: assertHex32(
      "0x693137639d1d0d15faea7701e93d66956a6d837befb43a005df14b53c0cb1c69",
    ),
    name: "Alice",
    photoUrl: "https://example.com/alice.png",
    updatedAt: "2098-01-01T00:00:00.000Z",
  },
  {
    candidateId: SECOND_CANDIDATE_ID,
    createdAt: "2098-01-01T00:00:00.000Z",
    displayOrder: 2,
    electionId: ELECTION_ID,
    metadataHash: assertHex32(
      "0x2c31e8c17676d7df5b27dd0b3e858de41fc1b4784c3f48f4f691896df5fc1e6d",
    ),
    name: "Bob",
    photoUrl: "https://example.com/bob.png",
    updatedAt: "2098-01-01T00:00:00.000Z",
  },
];

describe("onchain result helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads status, candidate IDs, and result tuples from the contract", async () => {
    const reader = {
      readContract: (async ({ functionName }: { functionName: string }) => {
        if (functionName === "getElectionStatus") {
          return ELECTION_STATUS.Active;
        }
        if (functionName === "getCandidates") {
          return [CANDIDATE_ID, SECOND_CANDIDATE_ID];
        }

        return [
          { candidateId: CANDIDATE_ID, votes: BigInt(3) },
          { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(5) },
        ];
      }) as never,
    };

    await expect(
      readOnchainResultSnapshot(
        reader,
        CONTRACT_ADDRESS,
        ELECTION_ID,
        new Date("2099-01-01T00:00:00.000Z"),
      ),
    ).resolves.toEqual({
      candidateIds: [CANDIDATE_ID, SECOND_CANDIDATE_ID],
      results: [
        { candidateId: CANDIDATE_ID, votes: BigInt(3) },
        { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(5) },
      ],
      status: ELECTION_STATUS.Active,
      syncedAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("maps onchain results to KV candidate metadata and summarizes winners", () => {
    const rows = mergeResultRows(candidates, {
      candidateIds: [CANDIDATE_ID, SECOND_CANDIDATE_ID],
      results: [
        { candidateId: CANDIDATE_ID, votes: BigInt(4) },
        { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(9) },
      ],
    });
    const summary = summarizeResults(rows);

    expect(rows).toMatchObject([
      { candidate: { name: "Alice" }, metadataStatus: "matched", votes: BigInt(4) },
      { candidate: { name: "Bob" }, metadataStatus: "matched", votes: BigInt(9) },
    ]);
    expect(summary.totalVotes).toBe(BigInt(13));
    expect(summary.winners).toMatchObject([{ candidate: { name: "Bob" } }]);
  });

  it("does not declare winners before any votes are recorded", () => {
    const rows = mergeResultRows(candidates, {
      candidateIds: [CANDIDATE_ID, SECOND_CANDIDATE_ID],
      results: [
        { candidateId: CANDIDATE_ID, votes: BigInt(0) },
        { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(0) },
      ],
    });

    expect(summarizeResults(rows).winners).toEqual([]);
  });

  it("keeps tied winners when candidates have matching non-zero votes", () => {
    const rows = mergeResultRows(candidates, {
      candidateIds: [CANDIDATE_ID, SECOND_CANDIDATE_ID],
      results: [
        { candidateId: CANDIDATE_ID, votes: BigInt(5) },
        { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(5) },
      ],
    });

    expect(summarizeResults(rows).winners.map((row) => row.candidateId)).toEqual([
      CANDIDATE_ID,
      SECOND_CANDIDATE_ID,
    ]);
  });

  it("keeps mismatched onchain and KV candidates visible", () => {
    const unknownCandidateId = assertHex32(
      "0x4444444444444444444444444444444444444444444444444444444444444444",
    );
    const rows = mergeResultRows(candidates.slice(0, 1), {
      candidateIds: [unknownCandidateId],
      results: [{ candidateId: unknownCandidateId, votes: BigInt(2) }],
    });

    expect(rows.map((row) => row.metadataStatus)).toEqual([
      "missing_kv_metadata",
      "missing_onchain_candidate",
    ]);
  });

  it("keeps onchain vote counts recoverable when KV metadata is unavailable", () => {
    const rows = mergeResultRows([], {
      candidateIds: [CANDIDATE_ID, SECOND_CANDIDATE_ID],
      results: [
        { candidateId: CANDIDATE_ID, votes: BigInt(7) },
        { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(4) },
      ],
    });
    const summary = summarizeResults(rows);

    expect(rows).toMatchObject([
      { candidateId: CANDIDATE_ID, metadataStatus: "missing_kv_metadata", votes: BigInt(7) },
      {
        candidateId: SECOND_CANDIDATE_ID,
        metadataStatus: "missing_kv_metadata",
        votes: BigInt(4),
      },
    ]);
    expect(summary.totalVotes).toBe(BigInt(11));
    expect(summary.winners.map((row) => row.candidateId)).toEqual([CANDIDATE_ID]);
  });

  it("formats verification labels and Sepolia explorer URLs", () => {
    expect(getElectionStatusLabel(ELECTION_STATUS.NotCreated)).toBe("Not created");
    expect(getElectionStatusLabel(ELECTION_STATUS.Pending)).toBe("Pending");
    expect(getElectionStatusLabel(ELECTION_STATUS.Active)).toBe("Active");
    expect(getElectionStatusLabel(ELECTION_STATUS.Ended)).toBe("Ended");
    expect(getEtherscanAddressUrl(CONTRACT_ADDRESS)).toBe(
      `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`,
    );
    expect(getEtherscanTransactionUrl(TX_HASH)).toBe(
      `https://sepolia.etherscan.io/tx/${TX_HASH}`,
    );
  });

  it("uses a public Sepolia RPC fallback unless an override is configured", () => {
    expect(getSepoliaRpcUrl()).toBe("https://rpc.sepolia.org");

    vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", "https://example-rpc.test");

    expect(getSepoliaRpcUrl()).toBe("https://example-rpc.test");
  });
});
