import { describe, expect, it } from "vitest";

import {
  ELECTION_STATUS,
  VOTING_CONTRACT_ABI,
  VOTING_CONTRACT_EVENTS,
  VOTING_CONTRACT_FUNCTIONS,
  assertAddress,
  assertHex32,
  getVotingContractFunctionNames,
  isAddress,
  isHex32,
} from "./voting-contract";

const getAbiEntry = (name: string) => {
  const entry = VOTING_CONTRACT_ABI.find((abiEntry) => abiEntry.name === name);

  if (!entry) {
    throw new Error(`ABI entry not found: ${name}`);
  }

  return entry;
};

describe("voting contract interface", () => {
  it("defines every Phase 2 contract function", () => {
    expect(getVotingContractFunctionNames()).toEqual(VOTING_CONTRACT_FUNCTIONS);
  });

  it("uses one contract interface for election and candidate identifiers", () => {
    expect(getAbiEntry("createElection")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32" },
        { name: "startAt", type: "uint64" },
        { name: "endAt", type: "uint64" },
        { name: "adminAddress", type: "address" },
      ],
      stateMutability: "nonpayable",
    });

    expect(getAbiEntry("registerCandidate")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32" },
        { name: "candidateId", type: "bytes32" },
        { name: "metadataHash", type: "bytes32" },
      ],
      stateMutability: "nonpayable",
    });
  });

  it("exposes election config needed for onchain verification", () => {
    expect(getAbiEntry("getElection")).toMatchObject({
      inputs: [{ name: "electionId", type: "bytes32" }],
      outputs: [
        { name: "adminAddress", type: "address" },
        { name: "startAt", type: "uint64" },
        { name: "endAt", type: "uint64" },
        { name: "candidateCount", type: "uint256" },
      ],
      stateMutability: "view",
    });
  });

  it("keeps vote writes minimal", () => {
    expect(getAbiEntry("vote")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32" },
        { name: "candidateId", type: "bytes32" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    });
  });

  it("validates bytes32 identifiers at runtime boundaries", () => {
    const validBytes32 = `0x${"a".repeat(64)}`;

    expect(isHex32(validBytes32)).toBe(true);
    expect(assertHex32(validBytes32, "electionId")).toBe(validBytes32);
    expect(isHex32("0x1234")).toBe(false);
    expect(isHex32(`0x${"a".repeat(63)}`)).toBe(false);
    expect(isHex32(`0x${"a".repeat(65)}`)).toBe(false);
    expect(isHex32(`0X${"a".repeat(64)}`)).toBe(false);
    expect(() => assertHex32("0x1234", "candidateId")).toThrow(
      "candidateId must be a 32-byte hex string",
    );
  });

  it("validates address inputs at runtime boundaries", () => {
    const validAddress = `0x${"b".repeat(40)}`;

    expect(isAddress(validAddress)).toBe(true);
    expect(assertAddress(validAddress, "adminAddress")).toBe(validAddress);
    expect(isAddress("0x1234")).toBe(false);
    expect(isAddress(`0x${"b".repeat(39)}`)).toBe(false);
    expect(isAddress(`0x${"b".repeat(41)}`)).toBe(false);
    expect(() => assertAddress("0x1234", "adminAddress")).toThrow(
      "adminAddress must be a 20-byte hex address",
    );
  });

  it("does not put candidate display metadata onchain", () => {
    const serializedAbi = JSON.stringify(VOTING_CONTRACT_ABI);

    expect(serializedAbi).not.toContain("candidateName");
    expect(serializedAbi).not.toContain("imageUrl");
    expect(serializedAbi).not.toContain("photoUrl");
  });

  it("includes read methods for status, voters, candidates, and results", () => {
    expect(getAbiEntry("hasVoted")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32" },
        { name: "voterAddress", type: "address" },
      ],
      outputs: [{ name: "voted", type: "bool" }],
      stateMutability: "view",
    });
    expect(getAbiEntry("getCandidateVotes")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32" },
        { name: "candidateId", type: "bytes32" },
      ],
      outputs: [{ name: "votes", type: "uint256" }],
      stateMutability: "view",
    });
    expect(getAbiEntry("getElectionResult")).toMatchObject({
      inputs: [{ name: "electionId", type: "bytes32" }],
      outputs: [
        {
          name: "results",
          type: "tuple[]",
          components: [
            { name: "candidateId", type: "bytes32" },
            { name: "votes", type: "uint256" },
          ],
        },
      ],
      stateMutability: "view",
    });
    expect(getAbiEntry("getElectionStatus")).toMatchObject({
      inputs: [{ name: "electionId", type: "bytes32" }],
      outputs: [{ name: "status", type: "uint8" }],
      stateMutability: "view",
    });
    expect(getAbiEntry("getCandidates")).toMatchObject({
      inputs: [{ name: "electionId", type: "bytes32" }],
      outputs: [{ name: "candidateIds", type: "bytes32[]" }],
      stateMutability: "view",
    });
  });

  it("defines events required for auditability", () => {
    const eventNames = VOTING_CONTRACT_ABI.filter(
      (entry) => entry.type === "event",
    ).map((entry) => entry.name);

    expect(eventNames).toEqual(VOTING_CONTRACT_EVENTS);
    expect(getAbiEntry("ElectionCreated")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32", indexed: true },
        { name: "adminAddress", type: "address", indexed: true },
        { name: "startAt", type: "uint64", indexed: false },
        { name: "endAt", type: "uint64", indexed: false },
      ],
    });
    expect(getAbiEntry("CandidateRegistered")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32", indexed: true },
        { name: "candidateId", type: "bytes32", indexed: true },
        { name: "metadataHash", type: "bytes32", indexed: false },
      ],
    });
    expect(getAbiEntry("VoteCast")).toMatchObject({
      inputs: [
        { name: "electionId", type: "bytes32", indexed: true },
        { name: "candidateId", type: "bytes32", indexed: true },
        { name: "voterAddress", type: "address", indexed: true },
        { name: "timestamp", type: "uint64", indexed: false },
      ],
    });
  });

  it("defines timestamp-based election statuses", () => {
    expect(ELECTION_STATUS).toEqual({
      NotCreated: 0,
      Pending: 1,
      Active: 2,
      Ended: 3,
    });
  });
});
