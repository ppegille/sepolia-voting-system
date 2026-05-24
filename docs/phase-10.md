# Phase 10 Testing and Security Coverage

## Scope

Phase 10 locks the core MVP security boundaries with regression tests. It does not add new product flows or deploy Sepolia infrastructure.

## Requirements Covered

- Duplicate voting is enforced by the smart contract at the wallet and election level.
- Voting is only possible during the configured active window.
- Rejected votes do not mutate candidate vote counts.
- A wallet can vote once per election, but the same wallet can participate in a different election.
- Candidate display metadata remains offchain; onchain records use `candidateId` and `metadataHash` only.
- Invite tokens remain hashed in KV and are excluded from AuditLog records.
- KV VoteRecord telemetry is bounded to existing election/candidate metadata and cannot overwrite another transaction hash.
- Onchain result rows remain recoverable when KV display metadata is unavailable.
- Protected operational logs are capped for predictable Worker responses.

## Test Matrix

| Boundary | Coverage |
| --- | --- |
| Duplicate vote prevention | `contracts/SepoliaVoting.test.ts` verifies `AlreadyVoted` and election-scoped voting. |
| Period restriction | `contracts/SepoliaVoting.test.ts` checks pending, active, and ended boundaries. |
| Rejected vote immutability | `contracts/SepoliaVoting.test.ts` verifies vote counts remain unchanged after rejected calls. |
| Offchain display metadata | `src/contracts/voting-contract.test.ts` verifies names/photo URLs are not in the ABI. |
| KV invite secrecy | `workers/api/test/index.test.ts` verifies raw invite tokens are not stored or logged. |
| KV/onchain source boundary | `src/results/onchain-results.test.ts` verifies onchain vote counts can be summarized without KV metadata. |
| VoteRecord integrity | `workers/api/test/index.test.ts` verifies existing election/candidate requirements and transaction hash conflict rejection. |
| Operational log bounds | `workers/api/test/index.test.ts` verifies direct AuditLog reads return at most 50 entries. |

## Security Notes

- Workers KV remains non-authoritative for vote counts and duplicate-vote prevention.
- VoteRecord entries are operational telemetry tied to transaction hashes; they do not affect `getElectionResult` or winner calculation.
- Metadata mismatches are surfaced in the UI rather than hidden.
- Operator endpoints use signed MetaMask requests and can be restricted with `OPERATOR_WALLET_ADDRESSES`.
