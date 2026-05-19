export const ELECTION_STATUS = {
  NotCreated: 0,
  Pending: 1,
  Active: 2,
  Ended: 3,
} as const;

export type ElectionStatus =
  (typeof ELECTION_STATUS)[keyof typeof ELECTION_STATUS];

declare const hex32Brand: unique symbol;

export type Hex32 = `0x${string}` & { readonly [hex32Brand]: "Hex32" };

export const BYTES32_HEX_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export const isHex32 = (value: string): value is Hex32 =>
  BYTES32_HEX_PATTERN.test(value);

export const assertHex32 = (value: string, label = "value"): Hex32 => {
  if (!isHex32(value)) {
    throw new Error(`${label} must be a 32-byte hex string`);
  }

  return value;
};

export const ADDRESS_HEX_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const isAddress = (value: string): value is `0x${string}` =>
  ADDRESS_HEX_PATTERN.test(value);

export const assertAddress = (value: string, label = "address") => {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a 20-byte hex address`);
  }

  return value;
};

export type ElectionId = Hex32;

export type CandidateId = Hex32;

export type VoteCommand = Readonly<{
  electionId: ElectionId;
  candidateId: CandidateId;
}>;

export type ElectionConfig = Readonly<{
  electionId: ElectionId;
  startAt: bigint;
  endAt: bigint;
  adminAddress: `0x${string}`;
}>;

export type CandidateRegistration = Readonly<{
  electionId: ElectionId;
  candidateId: CandidateId;
  metadataHash: Hex32;
}>;

export type CandidateResult = Readonly<{
  candidateId: CandidateId;
  votes: bigint;
}>;

export type ElectionOnchainConfig = Readonly<{
  adminAddress: `0x${string}`;
  startAt: bigint;
  endAt: bigint;
  candidateCount: bigint;
}>;

export const VOTING_CONTRACT_FUNCTIONS = [
  "createElection",
  "getElection",
  "registerCandidate",
  "vote",
  "hasVoted",
  "getCandidateVotes",
  "getElectionResult",
  "getElectionStatus",
  "getCandidates",
] as const;

export const VOTING_CONTRACT_EVENTS = [
  "ElectionCreated",
  "CandidateRegistered",
  "VoteCast",
] as const;

export type VotingContractFunction = (typeof VOTING_CONTRACT_FUNCTIONS)[number];

export type VotingContractEvent = (typeof VOTING_CONTRACT_EVENTS)[number];

export const VOTING_CONTRACT_ABI = [
  {
    type: "function",
    name: "createElection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "bytes32" },
      { name: "startAt", type: "uint64" },
      { name: "endAt", type: "uint64" },
      { name: "adminAddress", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getElection",
    stateMutability: "view",
    inputs: [{ name: "electionId", type: "bytes32" }],
    outputs: [
      { name: "adminAddress", type: "address" },
      { name: "startAt", type: "uint64" },
      { name: "endAt", type: "uint64" },
      { name: "candidateCount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "registerCandidate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "bytes32" },
      { name: "candidateId", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "bytes32" },
      { name: "candidateId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasVoted",
    stateMutability: "view",
    inputs: [
      { name: "electionId", type: "bytes32" },
      { name: "voterAddress", type: "address" },
    ],
    outputs: [{ name: "voted", type: "bool" }],
  },
  {
    type: "function",
    name: "getCandidateVotes",
    stateMutability: "view",
    inputs: [
      { name: "electionId", type: "bytes32" },
      { name: "candidateId", type: "bytes32" },
    ],
    outputs: [{ name: "votes", type: "uint256" }],
  },
  {
    type: "function",
    name: "getElectionResult",
    stateMutability: "view",
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
  },
  {
    type: "function",
    name: "getElectionStatus",
    stateMutability: "view",
    inputs: [{ name: "electionId", type: "bytes32" }],
    outputs: [{ name: "status", type: "uint8" }],
  },
  {
    type: "function",
    name: "getCandidates",
    stateMutability: "view",
    inputs: [{ name: "electionId", type: "bytes32" }],
    outputs: [{ name: "candidateIds", type: "bytes32[]" }],
  },
  {
    type: "event",
    name: "ElectionCreated",
    inputs: [
      { name: "electionId", type: "bytes32", indexed: true },
      { name: "adminAddress", type: "address", indexed: true },
      { name: "startAt", type: "uint64", indexed: false },
      { name: "endAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CandidateRegistered",
    inputs: [
      { name: "electionId", type: "bytes32", indexed: true },
      { name: "candidateId", type: "bytes32", indexed: true },
      { name: "metadataHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteCast",
    inputs: [
      { name: "electionId", type: "bytes32", indexed: true },
      { name: "candidateId", type: "bytes32", indexed: true },
      { name: "voterAddress", type: "address", indexed: true },
      { name: "timestamp", type: "uint64", indexed: false },
    ],
  },
] as const;

export const getVotingContractFunctionNames = () =>
  VOTING_CONTRACT_ABI.filter((entry) => entry.type === "function").map(
    (entry) => entry.name,
  ) as VotingContractFunction[];
