# Phase 3 KV Data Structure

## Scope

Phase 3 implements Workers KV data structures and CRUD-capable Worker API routes for offchain voting metadata.

This phase does not implement wallet signature authorization, MetaMask UI, Solidity contracts, or onchain result reads. Those remain later phases.

## Storage Boundary

- Workers KV stores election display metadata, candidate display metadata, invite links, and audit logs.
- Workers KV may cache onchain data in later phases, but it is not the final source for duplicate vote prevention or vote counts.
- Vote integrity remains the responsibility of the future Sepolia smart contract.
- Invite token raw values are returned only once at creation time and are never stored in KV.

## Key Scheme

| Data | Key Pattern | Purpose |
| --- | --- | --- |
| Election | `election:{electionId}` | Primary election metadata record |
| Election index | `election-index:created:{createdAt}:{electionId}` | List elections by creation time |
| Candidate | `candidate:{electionId}:{candidateId}` | Primary candidate metadata record |
| Candidate index | `candidate-index:{electionId}:{displayOrder}:{candidateId}` | List candidates by display order |
| Invite | `invite:{inviteId}` | Primary invite record with token hash only |
| Invite token lookup | `invite-token:{tokenHash}` | Resolve raw invite token hash to invite ID |
| Invite index | `invite-index:{electionId}:{createdAt}:{inviteId}` | List invites for an election |
| Audit log | `audit-log:{createdAt}:{logId}` | Append-only mutation audit records |

## Records

### Election

- `electionId`: bytes32 hex string shared with onchain storage.
- `title`: display title.
- `description`: display description.
- `adminWalletAddress`: 20-byte wallet address.
- `startAt`: ISO timestamp.
- `endAt`: ISO timestamp later than `startAt`.
- `status`: KV metadata status.
- `inviteTokenHash`: optional latest invite token hash.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.

### Candidate

- `candidateId`: bytes32 hex string shared with onchain storage.
- `electionId`: parent election ID.
- `name`: candidate display name.
- `photoUrl`: `http` or `https` image URL.
- `metadataHash`: bytes32 hash to match the future onchain candidate metadata hash.
- `displayOrder`: non-negative integer.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.

Canonical candidate metadata for future hashing is JSON with exactly these fields and order:

```json
{"name":"<candidate name>","photoUrl":"<candidate photo URL>"}
```

Phase 6 should use `keccak256` over this canonical UTF-8 payload when producing the Solidity `metadataHash`.

### Invite

- `inviteId`: bytes32 hex string.
- `electionId`: parent election ID.
- `tokenHash`: SHA-256 hash of the raw invite token with a domain separator.
- `expiresAt`: ISO timestamp.
- `status`: `active`, `expired`, or `disabled`.
- `createdBy`: creator wallet address.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.

### Audit Log

- `logId`: bytes32 hex string.
- `actorWalletAddress`: actor wallet address.
- `action`: mutation action name.
- `targetType`: `election`, `candidate`, `invite`, or `vote`.
- `targetId`: target record ID.
- `metadata`: non-sensitive metadata only.
- `createdAt`: ISO timestamp.

## Worker API Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API and KV binding health |
| `GET` | `/elections` | List elections |
| `POST` | `/elections` | Create election metadata |
| `GET` | `/elections/{electionId}` | Read one election |
| `PUT` | `/elections/{electionId}` | Update election metadata |
| `DELETE` | `/elections/{electionId}` | Delete election metadata and child KV records |
| `GET` | `/elections/{electionId}/candidates` | List candidates |
| `POST` | `/elections/{electionId}/candidates` | Create candidate metadata |
| `GET` | `/elections/{electionId}/candidates/{candidateId}` | Read one candidate |
| `PUT` | `/elections/{electionId}/candidates/{candidateId}` | Update candidate metadata |
| `DELETE` | `/elections/{electionId}/candidates/{candidateId}` | Delete candidate metadata |
| `GET` | `/elections/{electionId}/invites` | List invite records without raw tokens |
| `POST` | `/elections/{electionId}/invites` | Create an invite and return the raw token once |
| `POST` | `/invites/validate` | Validate a raw invite token |
| `PUT` | `/invites/{inviteId}` | Disable an invite |
| `DELETE` | `/invites/{inviteId}` | Delete an invite |
| `GET` | `/audit-logs` | List audit logs |

## Validation Rules

- `electionId`, `candidateId`, `metadataHash`, `inviteId`, and `tokenHash` must be bytes32 hex strings.
- Wallet addresses must be 20-byte hex addresses.
- Election `endAt` must be later than `startAt`.
- Candidate `photoUrl` must use `http` or `https`.
- Candidate `displayOrder` must be an integer from `0` to `99999999` so KV index sorting remains stable.
- Candidate create, update, and delete are rejected after the election `startAt` timestamp.
- Candidate name or photo URL changes must include a new `metadataHash`.
- Invite expiration must be in the future when the invite is created.
- Expired or disabled invites cannot pass token validation.
- Metadata write routes require `X-Actor-Wallet` and reject requests where the actor wallet does not match the election `adminWalletAddress`.

## Security Notes

- Raw invite tokens are not written to KV or audit logs.
- Token hashes use SHA-256 with a fixed domain separator for storage lookup.
- Audit metadata must not contain private keys, seed phrases, API keys, JWTs, passwords, or raw invite tokens.
- Phase 3 enforces administrator wallet address matching through `X-Actor-Wallet` for metadata writes.
- Strong proof that the caller controls that wallet requires MetaMask signature verification and remains a later phase.

## Implementation Artifacts

- `workers/api/src/metadata.ts`: KV schema, validation, store operations, token hashing, audit logging.
- `workers/api/src/index.ts`: Worker API routes for metadata CRUD.
- `workers/api/test/index.test.ts`: route, validation, invite-token, audit-log, and canonical metadata tests.
