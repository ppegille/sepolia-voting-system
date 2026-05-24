# Phase 9 Administrator and Operations Logs

## Scope

Phase 9 implements operator-facing reads for election metadata, AuditLog entries, and advisory vote transaction records.

This phase does not make KV vote records authoritative. Duplicate-vote prevention and vote counts remain onchain responsibilities.

## Requirements Covered

- `/admin` provides an operations dashboard for all KV election metadata.
- The Worker stores vote transaction state records for `submitted`, `success`, and `failed` states that have a transaction hash.
- Failed vote transaction records are visible in the operations dashboard.
- AuditLog entries are visible in the operations dashboard.
- Operator reads use signed MetaMask requests through `X-Actor-Message`, `X-Actor-Signature`, and `X-Actor-Wallet`.
- Optional `OPERATOR_WALLET_ADDRESSES` restricts protected operational reads to configured wallets.

## Runtime Configuration

Protected operations reads require the existing admin signature flow. To restrict access to specific operator wallets, configure:

```text
OPERATOR_WALLET_ADDRESSES=0x...,0x...
```

If the allowlist is not configured, any wallet that can produce a valid signed request can load the operational view. This keeps local development simple while allowing production deployments to enforce operator access.

## Data Boundary

- Vote transaction records in KV are operational telemetry only.
- Vote transaction records may be incomplete because client-side recording is best-effort and must not block voting.
- Signature rejections before transaction submission are shown in the UI but are not persisted as VoteRecords because they do not have a transaction hash.
- Raw invite tokens are not sent to the vote record endpoint and are not stored in AuditLog metadata.
- Failure reasons are stored on the VoteRecord for operator debugging, but AuditLog metadata excludes arbitrary failure text.
- Onchain results remain the source of truth for vote counts and winner calculation.

## Worker API

- `POST /vote-records`: records a voter-submitted transaction state.
- `GET /vote-records?status=failed`: lists vote records for operators.
- `GET /operations/summary`: returns election summaries, failed vote records, and recent AuditLog entries.
- `GET /audit-logs`: remains available for operator reads and now requires the signed operator flow.

## Implementation Artifacts

- `src/app/admin/page.tsx`: static operations route.
- `src/components/operations-dashboard.tsx`: operator wallet connection, signed refresh, election inventory, failed transaction list, and AuditLog list.
- `src/admin/admin-api.ts`: operations summary types and signed read helper.
- `src/vote/voting-api.ts`: best-effort vote transaction record helper.
- `workers/api/src/metadata.ts`: VoteRecord model, indexes, operations summary, and audit log sorting.
- `workers/api/src/index.ts`: vote record and operations endpoints with operator authorization.
- `workers/api/test/index.test.ts`: Worker VoteRecord, protected logs, and operations summary tests.
