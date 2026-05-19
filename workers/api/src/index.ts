import { assertAddress } from "../../../src/contracts/voting-contract";

import {
  assertJsonObject,
  MetadataError,
  MetadataStore,
  type CreateCandidateInput,
  type CreateElectionInput,
  type CreateInviteInput,
  type UpdateCandidateInput,
  type UpdateElectionInput,
} from "./metadata";

export interface Env {
  VOTING_METADATA: KVNamespace;
  FRONTEND_ORIGINS?: string;
}

type ApiPayload = {
  ok: boolean;
  service: string;
  phase: string;
  kvBinding: string;
  kvAvailable: boolean;
};

const DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000";

const isVotingPagesOrigin = (origin: string) => {
  try {
    const hostname = new URL(origin).hostname;

    return (
      hostname === "sepolia-voting-system.pages.dev" ||
      hostname.endsWith(".sepolia-voting-system.pages.dev")
    );
  } catch {
    return false;
  }
};

const getAllowedOrigin = (request: Request, env: Env) => {
  const origins =
    env.FRONTEND_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  const requestOrigin = request.headers.get("Origin");

  if (
    requestOrigin &&
    (origins.includes(requestOrigin) || isVotingPagesOrigin(requestOrigin))
  ) {
    return requestOrigin;
  }

  return origins[0] ?? DEFAULT_FRONTEND_ORIGIN;
};

const isKvAvailable = (kv: KVNamespace) =>
  typeof kv.get === "function" &&
  typeof kv.put === "function" &&
  typeof kv.delete === "function" &&
  typeof kv.list === "function";

const jsonHeaders = (origin: string) => ({
  "Access-Control-Allow-Headers": "Content-Type, X-Actor-Wallet",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": origin,
  "Content-Type": "application/json; charset=utf-8",
  Vary: "Origin",
});

export const createHealthPayload = (env: Env): ApiPayload => ({
  ok: true,
  service: "sepolia-voting-api",
  phase: "phase-3",
  kvBinding: "VOTING_METADATA",
  kvAvailable: isKvAvailable(env.VOTING_METADATA),
});

const jsonResponse = (origin: string, body: unknown, status = 200) =>
  Response.json(body, {
    headers: jsonHeaders(origin),
    status,
  });

const readJsonBody = async (request: Request) => {
  try {
    return assertJsonObject(await request.json());
  } catch (error) {
    if (error instanceof MetadataError) {
      throw error;
    }

    throw new MetadataError("Request body must be valid JSON");
  }
};

const getActorWalletAddress = (request: Request) => {
  const actorWalletAddress = request.headers.get("X-Actor-Wallet");

  if (!actorWalletAddress) {
    throw new MetadataError("X-Actor-Wallet header is required", 403);
  }

  return assertAddress(actorWalletAddress.toLowerCase(), "X-Actor-Wallet");
};

const requireMatchingAdmin = (actorWalletAddress: string, adminWalletAddress: unknown) => {
  const admin = assertAddress(
    String(adminWalletAddress ?? "").toLowerCase(),
    "adminWalletAddress",
  );

  if (actorWalletAddress !== admin) {
    throw new MetadataError("Actor wallet is not election admin", 403);
  }
};

const requireElectionAdmin = async (
  store: MetadataStore,
  electionId: string,
  actorWalletAddress: string,
) => {
  const election = await store.getElection(electionId);

  requireMatchingAdmin(actorWalletAddress, election.adminWalletAddress);

  return election;
};

const routeSegments = (url: URL) =>
  url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

export const handleRequest = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const allowedOrigin = getAllowedOrigin(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders(allowedOrigin) });
  }

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse(allowedOrigin, createHealthPayload(env));
  }

  const store = new MetadataStore(env.VOTING_METADATA);
  const segments = routeSegments(url);

  try {
    if (segments[0] === "elections" && segments.length === 1) {
      if (request.method === "GET") {
        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.listElections(),
        });
      }

      if (request.method === "POST") {
        const body = await readJsonBody(request);
        const actorWalletAddress = getActorWalletAddress(request);
        requireMatchingAdmin(actorWalletAddress, body.adminWalletAddress);

        return jsonResponse(
          allowedOrigin,
          {
            ok: true,
            data: await store.createElection(body as CreateElectionInput),
          },
          201,
        );
      }
    }

    if (segments[0] === "elections" && segments[1] && segments.length === 2) {
      if (request.method === "GET") {
        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.getElection(segments[1]),
        });
      }

      if (request.method === "PUT") {
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          segments[1],
          actorWalletAddress,
        );

        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.updateElection(
            segments[1],
            (await readJsonBody(request)) as UpdateElectionInput,
            actorWalletAddress,
          ),
        });
      }

      if (request.method === "DELETE") {
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          segments[1],
          actorWalletAddress,
        );
        await store.deleteElection(segments[1], actorWalletAddress);

        return jsonResponse(allowedOrigin, { ok: true });
      }
    }

    if (
      segments[0] === "elections" &&
      segments[1] &&
      segments[2] === "candidates" &&
      segments.length === 3
    ) {
      if (request.method === "GET") {
        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.listCandidates(segments[1]),
        });
      }

      if (request.method === "POST") {
        const body = await readJsonBody(request);
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          segments[1],
          actorWalletAddress,
        );

        return jsonResponse(
          allowedOrigin,
          {
            ok: true,
            data: await store.createCandidate(
              segments[1],
              body as CreateCandidateInput,
              actorWalletAddress,
            ),
          },
          201,
        );
      }
    }

    if (
      segments[0] === "elections" &&
      segments[1] &&
      segments[2] === "candidates" &&
      segments[3] &&
      segments.length === 4
    ) {
      if (request.method === "GET") {
        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.getCandidate(segments[1], segments[3]),
        });
      }

      if (request.method === "PUT") {
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          segments[1],
          actorWalletAddress,
        );

        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.updateCandidate(
            segments[1],
            segments[3],
            (await readJsonBody(request)) as UpdateCandidateInput,
            actorWalletAddress,
          ),
        });
      }

      if (request.method === "DELETE") {
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          segments[1],
          actorWalletAddress,
        );
        await store.deleteCandidate(segments[1], segments[3], actorWalletAddress);

        return jsonResponse(allowedOrigin, { ok: true });
      }
    }

    if (
      segments[0] === "elections" &&
      segments[1] &&
      segments[2] === "invites" &&
      segments.length === 3
    ) {
      if (request.method === "GET") {
        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.listInvites(segments[1]),
        });
      }

      if (request.method === "POST") {
        const body = await readJsonBody(request);
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          segments[1],
          actorWalletAddress,
        );

        return jsonResponse(
          allowedOrigin,
          {
            ok: true,
            data: await store.createInvite(
              segments[1],
              { ...body, createdBy: actorWalletAddress } as CreateInviteInput,
            ),
          },
          201,
        );
      }
    }

    if (
      segments[0] === "invites" &&
      segments[1] === "validate" &&
      segments.length === 2
    ) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);

        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.validateInviteToken(body.token as string),
        });
      }
    }

    if (segments[0] === "invites" && segments[1] && segments.length === 2) {
      if (request.method === "PUT") {
        const invite = await store.getInvite(segments[1]);
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          invite.electionId,
          actorWalletAddress,
        );

        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.disableInvite(segments[1], actorWalletAddress),
        });
      }

      if (request.method === "DELETE") {
        const invite = await store.getInvite(segments[1]);
        const actorWalletAddress = getActorWalletAddress(request);
        await requireElectionAdmin(
          store,
          invite.electionId,
          actorWalletAddress,
        );
        await store.deleteInvite(segments[1], actorWalletAddress);

        return jsonResponse(allowedOrigin, { ok: true });
      }
    }

    if (segments[0] === "audit-logs" && segments.length === 1) {
      if (request.method === "GET") {
        return jsonResponse(allowedOrigin, {
          ok: true,
          data: await store.listAuditLogs(),
        });
      }
    }
  } catch (error) {
    if (error instanceof MetadataError) {
      return jsonResponse(
        allowedOrigin,
        { ok: false, error: error.message },
        error.status,
      );
    }

    throw error;
  }

  return jsonResponse(allowedOrigin, { ok: false, error: "Not found" }, 404);
};

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
