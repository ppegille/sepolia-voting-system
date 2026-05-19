# Phase 1 Implementation

## Scope

- Next.js frontend scaffolded with TypeScript, Tailwind CSS, App Router, and ESLint.
- Frontend configured for Cloudflare Pages static export through `next build`.
- Cloudflare Workers API scaffolded under `workers/api`.
- Workers KV binding named `VOTING_METADATA` declared in `workers/api/wrangler.jsonc`.
- Local scripts added for frontend development, Pages preview/deploy, Worker development/deploy, type checking, linting, tests, and full verification.

## Data Boundary

- Workers KV stores offchain metadata only: candidate names, candidate image URLs, invite links, admin metadata, audit logs, and onchain read caches.
- Vote records, duplicate vote prevention, and vote counts must remain onchain in later phases.

## Local Commands

- `npm run dev`: run the Next.js frontend locally.
- `npm run build`: build the static Cloudflare Pages output into `out`.
- `npm run pages:preview`: preview the built Pages output locally.
- `npm run worker:dev`: run the Cloudflare Workers API locally.
- `npm run test`: run Worker unit tests.
- `npm run verify`: run type checks, lint, tests, and production build.
- `/health` reports that the `VOTING_METADATA` binding shape is present; it is not a deep KV read/write probe.

## Cloudflare Setup Notes

- Pages project: `sepolia-voting-system`.
- Pages URL after first deployment: `https://sepolia-voting-system.pages.dev/`.
- Latest deployment URL: `https://8b311d69.sepolia-voting-system.pages.dev/`.
- Worker URL: `https://sepolia-voting-api.hadoo6487.workers.dev/`.
- Production KV namespace ID: `dd96af40f1a6435cbac184d5905ce27d`.
- Preview KV namespace ID: `7739fbf61f5f4ce585fd67a4b4f5befd`.
- Keep secrets out of the repository. Use Cloudflare dashboard variables or Wrangler secrets for deployment-specific values.
