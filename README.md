# Sepolia Voting System

Project foundation for the Ethereum Sepolia voting MVP.

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Frontend hosting: Cloudflare Pages static output
- API: Cloudflare Workers
- Offchain metadata: Cloudflare Workers KV through `VOTING_METADATA`
- Onchain voting: Sepolia smart contract in later phases

## Getting Started

Run the frontend development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

Run the Worker API locally:

```bash
npm run worker:dev
```

When the frontend runs on `localhost` or `127.0.0.1` without `NEXT_PUBLIC_VOTING_API_BASE_URL`, it targets the local Worker at `http://localhost:8787`. Set `NEXT_PUBLIC_VOTING_API_BASE_URL` only when you intentionally want to use another Worker endpoint.

Verify the project:

```bash
npm run verify
```

## Cloudflare Pages

The frontend is configured with `output: "export"`. `npm run build` emits static output into `out` for Cloudflare Pages.

```bash
npm run build
npm run pages:preview
```

Deploy after local verification:

```bash
npm run pages:deploy
```

The Cloudflare Pages project is `sepolia-voting-system`. It will be available at `https://sepolia-voting-system.pages.dev/` after the first deployment.
The latest deployment URL is `https://8b311d69.sepolia-voting-system.pages.dev/`.

## Cloudflare Worker

The Worker API is configured in `workers/api/wrangler.jsonc`.
The deployed Worker URL is `https://sepolia-voting-api.hadoo6487.workers.dev/`.

```bash
npm run worker:dev
npm run worker:deploy
```

## Worker KV Binding

The Worker declares a KV binding named `VOTING_METADATA` in `workers/api/wrangler.jsonc`.

KV is for offchain metadata only. Vote counts and duplicate vote prevention must be handled by the Sepolia smart contract.

## Contract Interface

Phase 2 fixes the frontend-consumable contract interface in `src/contracts/voting-contract.ts` and documents the decisions in `docs/phase-2.md`.

## KV Metadata API

Phase 3 implements Workers KV metadata records and CRUD-capable Worker API routes in `workers/api/src/metadata.ts` and `workers/api/src/index.ts`.

The key design, record shapes, route list, validation rules, and token storage boundary are documented in `docs/phase-3.md`.

## Wallet Connection

Phase 4 implements MetaMask wallet readiness in `src/wallet/metamask.ts` and `src/components/wallet-status.tsx`.

The wallet flow checks MetaMask availability, connected account, Sepolia chain ID, network switching, and Sepolia ETH balance guidance. Details are documented in `docs/phase-4.md`.

## Administrator Flow

Phase 5 implements administrator metadata creation in `src/admin/admin-api.ts` and `src/components/admin-dashboard.tsx`.

Administrators can create election metadata, register candidates, and generate invite links through signed Worker API requests. Details are documented in `docs/phase-5.md`.

## Smart Contract

Phase 6 implements the local Solidity voting contract in `contracts/SepoliaVoting.sol` with Hardhat-based compilation and Vitest contract tests.

```bash
npm run contract:build
npm run test
```

The contract supports election creation, admin-only candidate registration, one-wallet-one-vote enforcement, period checks, and result reads. Details are documented in `docs/phase-6.md`.

## Voting Flow

Phase 7 implements the invite-based voter page at `/vote?invite=<token>`.

The page validates invite tokens through the Worker API, loads candidate display metadata from KV, checks wallet readiness, and submits `vote(electionId, candidateId)` through MetaMask when `NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS` is configured. Details are documented in `docs/phase-7.md`.
