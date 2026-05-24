import { describe, expect, it } from "vitest";

import {
  getElectionTimeStatus,
  isVoteCandidateThresholdMet,
  loadVoteInvitePackage,
  recordVoteTransaction,
  validateInviteToken,
  VoteApiError,
} from "./voting-api";

const ELECTION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const CANDIDATE_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const SECOND_CANDIDATE_ID =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const TRANSACTION_HASH =
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

const invite = {
  createdAt: "2098-01-01T00:00:00.000Z",
  createdBy: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  electionId: ELECTION_ID,
  expiresAt: "2099-01-01T00:00:00.000Z",
  inviteId: "0x4444444444444444444444444444444444444444444444444444444444444444",
  status: "active",
  tokenHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
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

describe("voting api helpers", () => {
  it("validates invite tokens and loads sorted candidate metadata", async () => {
    const requested: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requested.push(`${init?.method ?? "GET"} ${String(input)}`);

      if (String(input).endsWith("/invites/validate")) {
        expect(init?.body).toBe(JSON.stringify({ token: "secret-token" }));

        return Response.json({ ok: true, data: { election, invite } });
      }

      return Response.json({ ok: true, data: candidates });
    }) as typeof fetch;

    await expect(loadVoteInvitePackage(" secret-token ", fetcher)).resolves.toMatchObject({
      candidates: [{ candidateId: CANDIDATE_ID }, { candidateId: SECOND_CANDIDATE_ID }],
      election: { electionId: ELECTION_ID },
      invite: { status: "active" },
    });
    expect(requested).toHaveLength(2);
  });

  it("rejects missing invite tokens before calling the API", async () => {
    const fetcher = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    await expect(validateInviteToken(" ", fetcher)).rejects.toThrow(VoteApiError);
  });

  it("records vote transaction status without invite tokens", async () => {
    let capturedBody: string | undefined;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body);

      return Response.json({
        ok: true,
        data: {
          candidateId: CANDIDATE_ID,
          createdAt: "2099-01-01T00:00:00.000Z",
          electionId: ELECTION_ID,
          recordId:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "submitted",
          transactionHash: TRANSACTION_HASH,
          updatedAt: "2099-01-01T00:00:00.000Z",
          voterWalletAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        },
      });
    }) as typeof fetch;

    await recordVoteTransaction(
      {
        candidateId: CANDIDATE_ID,
        electionId: ELECTION_ID,
        status: "submitted",
        transactionHash: TRANSACTION_HASH,
        voterWalletAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
      },
      fetcher,
    );

    expect(capturedBody).toBe(
      JSON.stringify({
        candidateId: CANDIDATE_ID,
        electionId: ELECTION_ID,
        status: "submitted",
        transactionHash: TRANSACTION_HASH,
        voterWalletAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
      }),
    );
  });

  it("classifies local election time status", () => {
    expect(
      getElectionTimeStatus(election, new Date("2098-12-31T23:59:59.000Z")),
    ).toBe("not_started");
    expect(
      getElectionTimeStatus(election, new Date("2099-01-01T00:00:00.000Z")),
    ).toBe("active");
    expect(
      getElectionTimeStatus(election, new Date("2099-01-02T00:00:00.000Z")),
    ).toBe("ended");
  });

  it("requires at least two candidates before voting is ready", () => {
    expect(isVoteCandidateThresholdMet(1)).toBe(false);
    expect(isVoteCandidateThresholdMet(2)).toBe(true);
  });
});
