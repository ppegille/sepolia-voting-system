# Phase 2 Contract Interface

## Scope

Phase 2 fixes the smart contract interface only. It does not implement Solidity storage, modifiers, or transaction logic. The implementation phase remains Phase 6.

## Contract Shape

- A single contract manages all voting events.
- Every voting event is keyed by `electionId`.
- Every candidate is keyed by `candidateId` inside an election.
- A vote transaction contains only `electionId` and `candidateId`; the voter is `msg.sender` in the future Solidity implementation.
- Candidate display metadata stays offchain in Workers KV.
- Election status is derived from `block.timestamp`, `startAt`, and `endAt`; there are no manual `startElection` or `endElection` functions in the MVP interface.

## Identifier Types

| Name | ABI Type | Purpose |
| --- | --- | --- |
| `electionId` | `bytes32` | Stable ID for a voting event across onchain and KV records |
| `candidateId` | `bytes32` | Stable ID for a candidate inside an election |
| `metadataHash` | `bytes32` | Hash of offchain candidate metadata for integrity checks |

`src/contracts/voting-contract.ts` exposes `isHex32` and `assertHex32` so frontend and Worker code can validate IDs before passing them to a wallet or ABI encoder.
It also exposes `isAddress` and `assertAddress` for admin wallet inputs.

## Authorization Rules For Phase 6

- `createElection` must only be callable by an authorized election creator. For MVP, the caller should be either `adminAddress` itself or an allowlisted platform/operations admin.
- `registerCandidate` must only be callable by the election's `adminAddress` before `startAt`.
- `vote` must use `msg.sender` as the voter and must not accept a voter address as input.
- Read functions are public view functions.

## Write Functions

| Function | Inputs | Rule |
| --- | --- | --- |
| `createElection` | `electionId`, `startAt`, `endAt`, `adminAddress` | Create a timestamp-based election managed by `adminAddress` |
| `registerCandidate` | `electionId`, `candidateId`, `metadataHash` | Register a candidate before the election starts |
| `vote` | `electionId`, `candidateId` | Cast one vote from the connected wallet |

## Read Functions

| Function | Inputs | Output |
| --- | --- | --- |
| `getElection` | `electionId` | `adminAddress`, `startAt`, `endAt`, `candidateCount` |
| `hasVoted` | `electionId`, `voterAddress` | Whether the wallet has already voted in the election |
| `getCandidateVotes` | `electionId`, `candidateId` | Candidate vote count |
| `getElectionResult` | `electionId` | Array of candidate IDs and vote counts |
| `getElectionStatus` | `electionId` | `NotCreated`, `Pending`, `Active`, or `Ended` |
| `getCandidates` | `electionId` | Candidate ID list |

## Events

| Event | Indexed Fields | Purpose |
| --- | --- | --- |
| `ElectionCreated` | `electionId`, `adminAddress` | Audit election creation |
| `CandidateRegistered` | `electionId`, `candidateId` | Audit candidate registration |
| `VoteCast` | `electionId`, `candidateId`, `voterAddress` | Audit vote transactions without exposing offchain metadata |

## Onchain And Offchain Boundary

- Onchain: election ID, candidate ID, timestamps, admin address, metadata hash, wallet vote status, vote counts.
- Workers KV: title, description, candidate name, candidate image URL, invite links, audit metadata, read caches.
- Candidate name and image URL must not be added to the ABI.

## Phase 6 Notes

- `getElectionResult` returns an array of all candidate IDs and vote counts. Phase 6 must either keep candidate counts bounded or add pagination before supporting large elections.
- The ABI keeps `vote(electionId, candidateId)` minimal. The Solidity implementation must derive the voter from `msg.sender`.
- The Solidity status enum order must match `NotCreated = 0`, `Pending = 1`, `Active = 2`, `Ended = 3`.
- `metadataHash` should use `keccak256` over the canonical offchain candidate metadata representation decided in Phase 3.
- `VoteCast.timestamp` duplicates block timestamp intentionally to simplify audit log indexing and UI display.

## Implementation Artifacts

- `src/contracts/voting-contract.ts`: frontend-consumable ABI, enum values, and TypeScript command types.
- `src/contracts/voting-contract.test.ts`: tests that lock the function list, event list, vote shape, metadata boundary, and status enum.
