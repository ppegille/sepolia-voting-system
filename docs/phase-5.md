# Phase 5 Administrator Features

## Scope

Phase 5 implements the administrator workflow for creating voting metadata before the Solidity contract exists.

This phase creates Workers KV records through the Phase 3 Worker API. It does not call the future `createElection` or `registerCandidate` smart contract functions. Those onchain writes remain Phase 6.

## Requirements Covered

- Connect an administrator MetaMask wallet.
- Require Sepolia readiness for administrator actions.
- Create election metadata with title, description, start time, end time, and administrator wallet address.
- Generate a stable `electionId` bytes32 value for future onchain/KV mapping.
- Register candidates with name, photo URL, display order, generated `candidateId`, and generated `metadataHash`.
- Generate candidate `metadataHash` with Ethereum `keccak256` over canonical JSON: `{"name":"...","photoUrl":"..."}`.
- Require at least two candidates before invite creation is enabled.
- Create invite records through the Worker API and display the raw invite token once to the administrator.
- Keep raw invite token storage on the client only for the current UI state; KV stores only the token hash.

## Administrator API Boundary

The frontend signs each administrator write with MetaMask `personal_sign` before sending it to the Worker.

The signed message includes:

- Actor wallet address.
- Issued-at timestamp.
- HTTP method.
- Request path.
- Keccak hash of the request body.

The frontend sends the connected wallet in `X-Actor-Wallet`, the URI-encoded signed message in `X-Actor-Message`, and the signature in `X-Actor-Signature`. The Worker decodes the message, rejects stale signatures, verifies the signature with `viem`, and then compares the actor wallet with the election `adminWalletAddress`.

The Worker also enforces the administrator invariants server-side: candidate `metadataHash` must match the canonical candidate metadata, and invite creation is rejected until at least two candidates exist.

## Runtime Configuration

The frontend uses `NEXT_PUBLIC_VOTING_API_BASE_URL` when present.

If the variable is absent on `localhost` or `127.0.0.1`, the frontend targets the local Wrangler Worker:

```text
http://localhost:8787
```

If the variable is absent outside localhost, the deployed Worker endpoint is used:

```text
https://sepolia-voting-api.hadoo6487.workers.dev
```

## Invite Link Shape

Phase 5 creates share URLs in this shape:

```text
/vote?invite=<raw-token>
```

The `/vote` route is implemented in Phase 7. Until then, this URL is a stable handoff contract between the administrator flow and future voting UI.

## Security Boundary

- Candidate image files are not uploaded; only `photoUrl` is stored.
- Candidate name and photo URL remain offchain in KV.
- `candidateId`, `electionId`, and `metadataHash` are bytes32 values suitable for future contract calls.
- Raw invite tokens are shown once and are not sent to KV except as input for the Worker to hash.
- Sepolia wallet readiness is required for the administrator UX.
- Phase 5 signs offchain administrator API requests only; no Sepolia transaction is sent until Phase 6.

## Implementation Artifacts

- `src/admin/admin-api.ts`: admin client helpers, bytes32 generation, candidate metadata hashing, signed Worker API calls.
- `src/admin/admin-auth.ts`: shared admin request message and request body hash helpers.
- `src/admin/admin-api.test.ts`: tests for canonical metadata, keccak hash, invite URL shape, candidate threshold, and signed request headers.
- `src/components/admin-dashboard.tsx`: administrator UI for election creation, candidate registration, and invite creation.
- `workers/api/src/index.ts`: Worker signature verification and admin route authorization.
- `workers/api/src/metadata.ts`: metadata hash validation and candidate threshold enforcement.
- `src/app/page.tsx`: landing page includes the administrator panel.
