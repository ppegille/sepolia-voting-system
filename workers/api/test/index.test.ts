import { describe, expect, it } from "vitest";

import { createHealthPayload, handleRequest, type Env } from "../src";
import {
  createCandidateMetadataCanonicalJson,
  hashInviteToken,
  KV_KEYS,
  MetadataStore,
  type CandidateRecord,
  type ElectionRecord,
} from "../src/metadata";

const ADMIN_WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ELECTION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const CANDIDATE_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const METADATA_HASH =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const NEXT_METADATA_HASH =
  "0x4444444444444444444444444444444444444444444444444444444444444444";
const NEXT_ADMIN_WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

class MemoryKV {
  readonly values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? "";
    const keys = Array.from(this.values.keys())
      .filter((name) => name.startsWith(prefix))
      .sort()
      .map((name) => ({ name }));

    return { keys, list_complete: true };
  }
}

const createEnv = () => ({
  FRONTEND_ORIGINS: "http://localhost:3000,https://sepolia-voting-system.pages.dev",
  VOTING_METADATA: new MemoryKV() as unknown as KVNamespace,
}) satisfies Env;

const requestJson = (
  path: string,
  method: string,
  body?: Record<string, unknown>,
  actorWalletAddress = ADMIN_WALLET,
) =>
  new Request(`https://api.example.test${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-Actor-Wallet": actorWalletAddress,
    },
    method,
  });

const createElectionBody = (overrides: Record<string, unknown> = {}) => ({
  electionId: ELECTION_ID,
  title: "Student Council Election",
  description: "Pick one candidate.",
  adminWalletAddress: ADMIN_WALLET,
  startAt: "2099-01-01T00:00:00.000Z",
  endAt: "2099-01-02T00:00:00.000Z",
  ...overrides,
});

const createCandidateBody = (overrides: Record<string, unknown> = {}) => ({
  candidateId: CANDIDATE_ID,
  name: "Alice",
  photoUrl: "https://example.com/alice.png",
  metadataHash: METADATA_HASH,
  displayOrder: 1,
  ...overrides,
});

const readPayload = async <T>(response: Response) =>
  (await response.json()) as T;

describe("sepolia voting api", () => {
  it("describes the phase 3 health payload", () => {
    expect(createHealthPayload(createEnv())).toEqual({
      ok: true,
      service: "sepolia-voting-api",
      phase: "phase-3",
      kvBinding: "VOTING_METADATA",
      kvAvailable: true,
    });
  });

  it("responds to /health", async () => {
    const env = createEnv();
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
      createEnv(),
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
      createEnv(),
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
      createEnv(),
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
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, PUT, DELETE, OPTIONS",
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
      { ...createEnv(), FRONTEND_ORIGINS: "" },
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns 404 for unknown routes", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/missing"),
      createEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("creates, lists, updates, and deletes election metadata", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      requestJson("/elections", "POST", createElectionBody()),
      env,
    );
    const created = await readPayload<{ ok: true; data: ElectionRecord }>(
      createResponse,
    );

    expect(createResponse.status).toBe(201);
    expect(created.data).toMatchObject({
      electionId: ELECTION_ID,
      title: "Student Council Election",
      adminWalletAddress: ADMIN_WALLET,
      status: "candidate_registration",
    });

    const listResponse = await handleRequest(
      new Request("https://api.example.test/elections"),
      env,
    );
    const listed = await readPayload<{ ok: true; data: ElectionRecord[] }>(
      listResponse,
    );
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.electionId).toBe(ELECTION_ID);

    const updateResponse = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}`, "PUT", {
        title: "Updated Election",
      }),
      env,
    );
    const updated = await readPayload<{ ok: true; data: ElectionRecord }>(
      updateResponse,
    );
    expect(updated.data.title).toBe("Updated Election");

    const deleteResponse = await handleRequest(
      new Request(`https://api.example.test/elections/${ELECTION_ID}`, {
        headers: { "X-Actor-Wallet": ADMIN_WALLET },
        method: "DELETE",
      }),
      env,
    );
    expect(deleteResponse.status).toBe(200);

    const getDeletedResponse = await handleRequest(
      new Request(`https://api.example.test/elections/${ELECTION_ID}`),
      env,
    );
    expect(getDeletedResponse.status).toBe(404);
  });

  it("records the request actor when election admin metadata changes", async () => {
    const env = createEnv();
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);

    const response = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}`, "PUT", {
        adminWalletAddress: NEXT_ADMIN_WALLET,
      }),
      env,
    );
    expect(response.status).toBe(200);

    const logsResponse = await handleRequest(
      new Request("https://api.example.test/audit-logs"),
      env,
    );
    const logs = await readPayload<{
      ok: true;
      data: { action: string; actorWalletAddress: string }[];
    }>(logsResponse);
    const updateLog = logs.data.find((log) => log.action === "election.update");

    expect(updateLog?.actorWalletAddress).toBe(ADMIN_WALLET);
  });

  it("rejects invalid election time ranges", async () => {
    const response = await handleRequest(
      requestJson(
        "/elections",
        "POST",
        createElectionBody({
          startAt: "2099-01-02T00:00:00.000Z",
          endAt: "2099-01-01T00:00:00.000Z",
        }),
      ),
      createEnv(),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "endAt must be later than startAt",
    });
    expect(response.status).toBe(400);
  });

  it("rejects duplicate election IDs", async () => {
    const env = createEnv();
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);

    const response = await handleRequest(
      requestJson("/elections", "POST", createElectionBody()),
      env,
    );

    expect(response.status).toBe(409);
  });

  it("requires the actor wallet to match the election admin for writes", async () => {
    const env = createEnv();
    const missingActorResponse = await handleRequest(
      new Request("https://api.example.test/elections", {
        body: JSON.stringify(createElectionBody()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      env,
    );
    expect(missingActorResponse.status).toBe(403);

    const wrongActorResponse = await handleRequest(
      requestJson(
        "/elections",
        "POST",
        createElectionBody(),
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
      env,
    );
    expect(wrongActorResponse.status).toBe(403);
  });

  it("creates, lists, updates, and deletes candidate metadata", async () => {
    const env = createEnv();
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);

    const createResponse = await handleRequest(
      requestJson(
        `/elections/${ELECTION_ID}/candidates`,
        "POST",
        createCandidateBody(),
      ),
      env,
    );
    const created = await readPayload<{ ok: true; data: CandidateRecord }>(
      createResponse,
    );
    expect(createResponse.status).toBe(201);
    expect(created.data).toMatchObject({
      candidateId: CANDIDATE_ID,
      electionId: ELECTION_ID,
      metadataHash: METADATA_HASH,
    });

    const listResponse = await handleRequest(
      new Request(`https://api.example.test/elections/${ELECTION_ID}/candidates`),
      env,
    );
    const listed = await readPayload<{ ok: true; data: CandidateRecord[] }>(
      listResponse,
    );
    expect(listed.data.map((candidate) => candidate.candidateId)).toEqual([
      CANDIDATE_ID,
    ]);

    const missingHashResponse = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}/candidates/${CANDIDATE_ID}`, "PUT", {
        name: "Alice Updated",
      }),
      env,
    );
    expect(missingHashResponse.status).toBe(400);

    const updateResponse = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}/candidates/${CANDIDATE_ID}`, "PUT", {
        displayOrder: 3,
        metadataHash: NEXT_METADATA_HASH,
        name: "Alice Updated",
      }),
      env,
    );
    const updated = await readPayload<{ ok: true; data: CandidateRecord }>(
      updateResponse,
    );
    expect(updated.data.displayOrder).toBe(3);
    expect(updated.data.metadataHash).toBe(NEXT_METADATA_HASH);

    const deleteResponse = await handleRequest(
      new Request(
        `https://api.example.test/elections/${ELECTION_ID}/candidates/${CANDIDATE_ID}`,
        {
          headers: { "X-Actor-Wallet": ADMIN_WALLET },
          method: "DELETE",
        },
      ),
      env,
    );
    expect(deleteResponse.status).toBe(200);
  });

  it("deletes child candidate and invite records when deleting an election", async () => {
    const kv = new MemoryKV();
    const env = {
      ...createEnv(),
      VOTING_METADATA: kv as unknown as KVNamespace,
    } satisfies Env;
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);
    await handleRequest(
      requestJson(
        `/elections/${ELECTION_ID}/candidates`,
        "POST",
        createCandidateBody(),
      ),
      env,
    );
    await handleRequest(
      requestJson(`/elections/${ELECTION_ID}/invites`, "POST", {
        createdBy: ADMIN_WALLET,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      env,
    );

    const response = await handleRequest(
      new Request(`https://api.example.test/elections/${ELECTION_ID}`, {
        headers: { "X-Actor-Wallet": ADMIN_WALLET },
        method: "DELETE",
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(
      Array.from(kv.values.keys()).filter(
        (key) =>
          key.startsWith("candidate:") ||
          key.startsWith("candidate-index:") ||
          key.startsWith("invite:") ||
          key.startsWith("invite-index:") ||
          key.startsWith("invite-token:"),
      ),
    ).toEqual([]);
  });

  it("rejects invalid candidate photo URLs", async () => {
    const env = createEnv();
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);

    const response = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}/candidates`, "POST", {
        ...createCandidateBody(),
        photoUrl: "javascript:alert(1)",
      }),
      env,
    );

    expect(response.status).toBe(400);
  });

  it("rejects candidate display orders outside the indexed range", async () => {
    const env = createEnv();
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);

    const response = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}/candidates`, "POST", {
        ...createCandidateBody(),
        displayOrder: 100_000_000,
      }),
      env,
    );

    expect(response.status).toBe(400);
  });

  it("prevents candidate changes after the election starts", async () => {
    const kv = new MemoryKV() as unknown as KVNamespace;
    const store = new MetadataStore(kv, () => new Date("2099-01-01T00:00:01.000Z"));
    await store.createElection(
      createElectionBody({
        startAt: "2099-01-01T00:00:00.000Z",
        endAt: "2099-01-02T00:00:00.000Z",
      }),
    );

    await expect(
      store.createCandidate(ELECTION_ID, createCandidateBody()),
    ).rejects.toThrow("Candidates cannot be changed after election start");
  });

  it("creates hashed invites and validates the raw token without storing it", async () => {
    const kv = new MemoryKV();
    const store = new MetadataStore(
      kv as unknown as KVNamespace,
      () => new Date("2098-12-01T00:00:00.000Z"),
    );
    await store.createElection(createElectionBody());

    const { invite, token } = await store.createInvite(ELECTION_ID, {
      createdBy: ADMIN_WALLET,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const tokenHash = await hashInviteToken(token);

    expect(invite.tokenHash).toBe(tokenHash);
    expect(kv.values.get(KV_KEYS.inviteToken(tokenHash))).toBe(
      JSON.stringify({ inviteId: invite.inviteId }),
    );
    expect(Array.from(kv.values.values()).join("\n")).not.toContain(token);

    await expect(store.validateInviteToken(token)).resolves.toMatchObject({
      invite: { inviteId: invite.inviteId, status: "active" },
      election: { electionId: ELECTION_ID },
    });

    await store.disableInvite(invite.inviteId);
    await expect(store.validateInviteToken(token)).rejects.toThrow(
      "Invite token is invalid",
    );
  });

  it("rejects invite tokens that were never created", async () => {
    const store = new MetadataStore(new MemoryKV() as unknown as KVNamespace);

    await expect(store.validateInviteToken("missing-token")).rejects.toThrow(
      "Invite token is invalid",
    );
  });

  it("uses the request actor for invite routes and rejects non-admin invite writes", async () => {
    const env = createEnv();
    await handleRequest(requestJson("/elections", "POST", createElectionBody()), env);

    const createInviteResponse = await handleRequest(
      requestJson(`/elections/${ELECTION_ID}/invites`, "POST", {
        createdBy: NEXT_ADMIN_WALLET,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      env,
    );
    const created = await readPayload<{
      ok: true;
      data: { invite: { createdBy: string; inviteId: string }; token: string };
    }>(createInviteResponse);

    expect(createInviteResponse.status).toBe(201);
    expect(created.data.invite.createdBy).toBe(ADMIN_WALLET);

    const wrongActorResponse = await handleRequest(
      new Request(
        `https://api.example.test/invites/${created.data.invite.inviteId}`,
        {
          headers: { "X-Actor-Wallet": NEXT_ADMIN_WALLET },
          method: "PUT",
        },
      ),
      env,
    );
    expect(wrongActorResponse.status).toBe(403);

    const disableResponse = await handleRequest(
      new Request(
        `https://api.example.test/invites/${created.data.invite.inviteId}`,
        {
          headers: { "X-Actor-Wallet": ADMIN_WALLET },
          method: "PUT",
        },
      ),
      env,
    );
    expect(disableResponse.status).toBe(200);

    const deleteResponse = await handleRequest(
      new Request(
        `https://api.example.test/invites/${created.data.invite.inviteId}`,
        {
          headers: { "X-Actor-Wallet": ADMIN_WALLET },
          method: "DELETE",
        },
      ),
      env,
    );
    expect(deleteResponse.status).toBe(200);

    const logs = await readPayload<{
      ok: true;
      data: { action: string; actorWalletAddress: string }[];
    }>(
      await handleRequest(new Request("https://api.example.test/audit-logs"), env),
    );
    expect(
      logs.data.find((log) => log.action === "invite.create")?.actorWalletAddress,
    ).toBe(ADMIN_WALLET);
    expect(
      logs.data.find((log) => log.action === "invite.disable")?.actorWalletAddress,
    ).toBe(ADMIN_WALLET);
    expect(
      logs.data.find((log) => log.action === "invite.delete")?.actorWalletAddress,
    ).toBe(ADMIN_WALLET);
  });

  it("marks expired invites as expired before listing or validating them", async () => {
    let currentDate = new Date("2098-12-01T00:00:00.000Z");
    const kv = new MemoryKV();
    const store = new MetadataStore(
      kv as unknown as KVNamespace,
      () => currentDate,
    );
    await store.createElection(createElectionBody());
    const { token } = await store.createInvite(ELECTION_ID, {
      createdBy: ADMIN_WALLET,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    currentDate = new Date("2099-01-01T00:00:01.000Z");

    await expect(store.validateInviteToken(token)).rejects.toThrow(
      "Invite token is expired",
    );
    await expect(store.listInvites(ELECTION_ID)).resolves.toMatchObject([
      { status: "expired" },
    ]);
  });

  it("does not accept extra path segments for invite validation", async () => {
    const response = await handleRequest(
      requestJson("/invites/validate/extra", "POST", { token: "bad-token" }),
      createEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("records audit logs for metadata mutations without raw invite tokens", async () => {
    const kv = new MemoryKV();
    const store = new MetadataStore(kv as unknown as KVNamespace);
    await store.createElection(createElectionBody());
    const { token } = await store.createInvite(ELECTION_ID, {
      createdBy: ADMIN_WALLET,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const logs = await store.listAuditLogs();

    expect(logs.map((log) => log.action).sort()).toEqual([
      "election.create",
      "invite.create",
    ]);
    expect(JSON.stringify(logs)).not.toContain(token);
  });

  it("fixes the canonical candidate metadata payload for future keccak hashing", () => {
    expect(
      createCandidateMetadataCanonicalJson({
        name: "Alice",
        photoUrl: "https://example.com/alice.png",
      }),
    ).toBe(
      JSON.stringify({
        name: "Alice",
        photoUrl: "https://example.com/alice.png",
      }),
    );
  });
});
