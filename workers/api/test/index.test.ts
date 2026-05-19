import { describe, expect, it } from "vitest";

import { createHealthPayload, handleRequest, type Env } from "../src";

const env = {
  FRONTEND_ORIGINS: "http://localhost:3000,https://sepolia-voting-system.pages.dev",
  VOTING_METADATA: {
    delete: async () => undefined,
    get: async () => null,
    list: async () => ({ keys: [], list_complete: true }),
    put: async () => undefined,
  } as unknown as KVNamespace,
} satisfies Env;

describe("sepolia voting api", () => {
  it("describes the phase 1 health payload", () => {
    expect(createHealthPayload(env)).toEqual({
      ok: true,
      service: "sepolia-voting-api",
      phase: "phase-1",
      kvBinding: "VOTING_METADATA",
      kvAvailable: true,
    });
  });

  it("responds to /health", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/health"),
      env,
    );

    await expect(response.json()).resolves.toEqual(createHealthPayload(env));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("allows the deployed Pages origin", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/health", {
        headers: { Origin: "https://sepolia-voting-system.pages.dev" },
      }),
      env,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://sepolia-voting-system.pages.dev",
    );
  });

  it("allows deployment-specific Pages origins", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/health", {
        headers: { Origin: "https://8b311d69.sepolia-voting-system.pages.dev" },
      }),
      env,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://8b311d69.sepolia-voting-system.pages.dev",
    );
  });

  it("does not reflect untrusted origins", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/health", {
        headers: { Origin: "https://evil.example" },
      }),
      env,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("handles OPTIONS preflight requests", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/health", {
        headers: { Origin: "https://sepolia-voting-system.pages.dev" },
        method: "OPTIONS",
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://sepolia-voting-system.pages.dev",
    );
  });

  it("falls back to localhost when origins are not configured", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/health", {
        headers: { Origin: "https://evil.example" },
      }),
      { ...env, FRONTEND_ORIGINS: "" },
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns 404 for unknown routes", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/missing"),
      env,
    );

    expect(response.status).toBe(404);
  });
});
