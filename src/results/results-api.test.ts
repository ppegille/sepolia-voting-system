import { describe, expect, it } from "vitest";

import {
  createResultShareUrl,
  createVerificationUrl,
  loadResultMetadataPackage,
  normalizeOptionalTransactionHash,
  normalizeResultElectionId,
  ResultApiError,
} from "./results-api";

const ELECTION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const CANDIDATE_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const SECOND_CANDIDATE_ID =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const TX_HASH =
  "0x9999999999999999999999999999999999999999999999999999999999999999";

const election = {
  adminWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2098-01-01T00:00:00.000Z",
  description: "Pick one candidate.",
  electionId: ELECTION_ID,
  endAt: "2099-01-02T00:00:00.000Z",
  startAt: "2099-01-01T00:00:00.000Z",
  status: "ready",
  title: "Student Council Election",
  updatedAt: "2098-01-01T00:00:00.000Z",
};

const candidates = [
  {
    candidateId: SECOND_CANDIDATE_ID,
    createdAt: "2098-01-01T00:00:00.000Z",
    displayOrder: 2,
    electionId: ELECTION_ID,
    metadataHash:
      "0x2c31e8c17676d7df5b27dd0b3e858de41fc1b4784c3f48f4f691896df5fc1e6d",
    name: "Bob",
    photoUrl: "https://example.com/bob.png",
    updatedAt: "2098-01-01T00:00:00.000Z",
  },
  {
    candidateId: CANDIDATE_ID,
    createdAt: "2098-01-01T00:00:00.000Z",
    displayOrder: 1,
    electionId: ELECTION_ID,
    metadataHash:
      "0x693137639d1d0d15faea7701e93d66956a6d837befb43a005df14b53c0cb1c69",
    name: "Alice",
    photoUrl: "https://example.com/alice.png",
    updatedAt: "2098-01-01T00:00:00.000Z",
  },
];

describe("result api helpers", () => {
  it("loads election metadata and sorted candidates", async () => {
    const requested: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      requested.push(String(input));

      if (String(input).includes("/candidates")) {
        return Response.json({ ok: true, data: candidates });
      }

      return Response.json({ ok: true, data: election });
    }) as typeof fetch;

    await expect(loadResultMetadataPackage(ELECTION_ID, fetcher)).resolves.toMatchObject({
      candidates: [{ candidateId: CANDIDATE_ID }, { candidateId: SECOND_CANDIDATE_ID }],
      election: { electionId: ELECTION_ID },
    });
    expect(requested).toHaveLength(2);
  });

  it("creates share and verification URLs", () => {
    expect(createResultShareUrl("https://example.com", ELECTION_ID)).toBe(
      `https://example.com/results?electionId=${ELECTION_ID}`,
    );
    expect(createVerificationUrl("https://example.com", ELECTION_ID, TX_HASH)).toBe(
      `https://example.com/verify?electionId=${ELECTION_ID}&tx=${TX_HASH}`,
    );
    expect(createVerificationUrl("https://example.com", ELECTION_ID)).toBe(
      `https://example.com/verify?electionId=${ELECTION_ID}`,
    );
  });

  it("surfaces Worker API failures as ResultApiError", async () => {
    const fetcher = (async () =>
      Response.json({ ok: false, error: "Election not found" }, { status: 404 })) as typeof fetch;

    await expect(loadResultMetadataPackage(ELECTION_ID, fetcher)).rejects.toThrow(
      ResultApiError,
    );
  });

  it("validates result query identifiers", () => {
    expect(normalizeResultElectionId(ELECTION_ID)).toBe(ELECTION_ID);
    expect(normalizeOptionalTransactionHash(TX_HASH)).toBe(TX_HASH);
    expect(normalizeOptionalTransactionHash(null)).toBeNull();
    expect(() => normalizeResultElectionId(null)).toThrow(ResultApiError);
    expect(() => normalizeResultElectionId("invalid")).toThrow(
      "electionId must be a 32-byte hex string",
    );
  });
});
