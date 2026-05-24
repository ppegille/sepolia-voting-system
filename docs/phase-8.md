# Phase 8 Result Lookup and Onchain Verification

## Scope

Phase 8 implements result lookup pages for current vote counts, final results, and Sepolia verification.

This phase does not deploy the contract and does not write vote transaction records to KV. Sepolia deployment remains Phase 11, and operational transaction/audit dashboards remain Phase 9.

## Requirements Covered

- `/results?electionId=<bytes32>` loads election and candidate metadata from Workers KV.
- `/verify?electionId=<bytes32>` presents the same onchain snapshot with a verification-first layout.
- The frontend reads `getElectionStatus`, `getCandidates`, and `getElectionResult` from the configured Sepolia contract.
- Current vote counts are displayed while the election is active.
- Final vote counts and winner/leader information are displayed after the election ends.
- Candidate names and photo URLs come from KV and are matched to onchain `candidateId` values.
- The verification panel shows contract address, electionId, candidateIds, optional transaction hash, and Sepolia explorer links.
- The result pages can refresh onchain data and show the last sync time.

## Runtime Configuration

Result lookup requires a deployed contract address:

```text
NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS=<deployed Sepolia contract address>
```

The Sepolia RPC endpoint defaults to the public RPC configured for the wallet flow and can be overridden with:

```text
NEXT_PUBLIC_SEPOLIA_RPC_URL=<https rpc endpoint>
```

If the contract address is missing, KV metadata still loads but onchain vote totals are not shown.

## Data Boundary

- Onchain vote counts are the source of truth for current and final results.
- KV metadata is used only for display fields such as title, description, candidate name, candidate photo URL, and display order.
- The UI keeps mismatches visible when a candidate exists onchain without KV metadata or exists in KV but is missing from the onchain candidate list.
- Optional transaction hashes are query parameters for explorer linking only; Phase 8 does not persist vote transaction records.

## Implementation Artifacts

- `src/app/results/page.tsx`: static result route.
- `src/app/verify/page.tsx`: static onchain verification route.
- `src/components/result-dashboard.tsx`: result table, winner/leader panel, and verification panel.
- `src/results/results-api.ts`: Worker metadata loading and result/verification URL helpers.
- `src/results/onchain-results.ts`: Sepolia public client, contract reads, metadata/result merging, summaries, and explorer links.
- `src/results/results-api.test.ts`: metadata loading and URL helper tests.
- `src/results/onchain-results.test.ts`: contract read, result merge, summary, mismatch, and explorer URL tests.
