# Phase 7 Voting Participation UI

## Scope

Phase 7 implements the invite-based voter participation page at `/vote`.

This phase wires the existing Worker invite metadata API to the frontend and prepares the MetaMask transaction flow for the deployed `SepoliaVoting` contract. Contract deployment remains Phase 11, so voting is enabled only when `NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS` is configured.

## Requirements Covered

- `/vote?invite=<raw-token>` validates the raw invite token through the Worker API.
- Missing, invalid, expired, or disabled invite tokens block access to the voting flow.
- The voter page loads election metadata and candidate display metadata from Workers KV.
- Candidate name and photo URL remain offchain; the onchain transaction only uses `electionId` and `candidateId`.
- The voter connects MetaMask, switches to Sepolia when needed, and sees Sepolia ETH gas guidance.
- The UI blocks voting before start time, after end time, when fewer than two candidates are available, when the wallet already voted, or when the contract address is not configured.
- The vote transaction calls `vote(electionId, candidateId)` through MetaMask `eth_sendTransaction`.
- Transaction states are visible: waiting for signature, submitted, confirmed, and failed.
- The page can refresh `hasVoted` and candidate vote counts from the configured contract with `eth_call`.

## Runtime Configuration

The voter page uses the same Worker base URL selection as the administrator flow:

- `NEXT_PUBLIC_VOTING_API_BASE_URL` when explicitly set.
- Local Wrangler Worker on `localhost` or `127.0.0.1`.
- Deployed Worker outside local development.

Onchain voting requires:

```text
NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS=<deployed Sepolia contract address>
```

If the variable is missing, invite validation and candidate display still work, but the vote transaction button remains disabled.

## Transaction Boundary

The frontend constructs calldata with the Phase 2 ABI:

```text
vote(bytes32 electionId, bytes32 candidateId)
```

The wallet address is never sent as a function argument. The contract derives the voter from `msg.sender` and enforces one-wallet-one-vote.

## Implementation Artifacts

- `src/app/vote/page.tsx`: static `/vote` route for Cloudflare Pages export.
- `src/components/vote-participation.tsx`: invite validation UI, candidate selection, wallet readiness, onchain reads, and transaction status display.
- `src/vote/voting-api.ts`: public Worker API helpers for invite validation and candidate loading.
- `src/vote/vote-transaction.ts`: MetaMask transaction and contract read helpers.
- `src/vote/voting-api.test.ts`: invite loading and voting readiness tests.
- `src/vote/vote-transaction.test.ts`: calldata, transaction, receipt, and `eth_call` helper tests.
