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
