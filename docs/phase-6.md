# Phase 6 Smart Contract Development

## Scope

Phase 6 implements the local Solidity smart contract for the Sepolia voting MVP.

This phase does not deploy to Sepolia and does not connect the frontend voting UI to the contract. Sepolia deployment remains Phase 11, and the voting transaction UI remains Phase 7.

## Requirements Covered

- A single contract manages multiple voting events by `electionId`.
- `createElection` creates a future timestamp-based election with `electionId`, `startAt`, `endAt`, and `adminAddress`.
- `registerCandidate` stores `candidateId` and `metadataHash` for an election.
- Candidate registration is restricted to the election admin and only before `startAt`.
- `vote` records one vote for one candidate from `msg.sender`.
- The contract rejects votes before start time, after end time, for unknown candidates, with fewer than two candidates, and from wallets that already voted in the election.
- Read functions expose election configuration, vote status, candidate votes, all candidates, election status, and result arrays.
- Events provide onchain auditability for election creation, candidate registration, and vote casting.

## Contract Boundary

Onchain storage includes:

- `electionId`
- `adminAddress`
- `startAt`
- `endAt`
- `candidateId`
- `metadataHash`
- candidate vote counts
- wallet vote status per election

Onchain storage excludes:

- election title and description
- candidate name
- candidate photo URL
- invite token or invite token hash
- raw transaction status cache

## Status Rules

`getElectionStatus` returns the Phase 2 enum order:

- `0`: `NotCreated`
- `1`: `Pending`
- `2`: `Active`
- `3`: `Ended`

Status is based on `block.timestamp`, `startAt`, and `endAt`. The two-candidate minimum is enforced by `vote`, so an active time window still cannot receive valid votes until at least two candidates are registered.

## Authorization Rules

- `createElection` must be called by the same wallet supplied as `adminAddress`.
- Only the stored election `adminAddress` can register candidates.
- Voters are always derived from `msg.sender`; `vote` never accepts a voter address input.

## Tooling

- Hardhat 3 is used for Solidity compilation.
- `@nomicfoundation/hardhat-viem` is used for local contract deployment in tests.
- `@nomicfoundation/hardhat-network-helpers` is used for timestamp control in tests.
- Contract tests are run through Vitest so the existing project test command remains unified.

## Local Commands

```bash
npm run contract:build
npm run test
npm run verify
```

`npm run test` builds the contract before running Vitest so contract artifacts are available in clean workspaces.

## Implementation Artifacts

- `contracts/SepoliaVoting.sol`: Solidity voting contract.
- `contracts/SepoliaVoting.test.ts`: local contract tests for creation, candidate registration, voting, duplicate prevention, period checks, and result reads.
- `hardhat.config.ts`: Hardhat Solidity compiler and plugin configuration.
- `package.json`: contract build script and verification integration.
