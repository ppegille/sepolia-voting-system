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
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": origin,
  "Content-Type": "application/json; charset=utf-8",
  Vary: "Origin",
});

export const createHealthPayload = (env: Env): ApiPayload => ({
  ok: true,
  service: "sepolia-voting-api",
  phase: "phase-1",
  kvBinding: "VOTING_METADATA",
  kvAvailable: isKvAvailable(env.VOTING_METADATA),
});

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
    return Response.json(createHealthPayload(env), {
      headers: jsonHeaders(allowedOrigin),
    });
  }

  return Response.json(
    { ok: false, error: "Not found" },
    { headers: jsonHeaders(allowedOrigin), status: 404 },
  );
};

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
