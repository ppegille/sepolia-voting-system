import {
  assertAddress,
  assertHex32,
  isAddress,
  isHex32,
  type CandidateId,
  type ElectionId,
  type Hex32,
} from "../../../src/contracts/voting-contract";
import { createCandidateMetadataHash } from "../../../src/admin/candidate-metadata";

type JsonObject = Record<string, unknown>;

export type ElectionMetadataStatus =
  | "candidate_registration"
  | "ready"
  | "active"
  | "ended"
  | "archived";

export type InviteStatus = "active" | "expired" | "disabled";

export type AuditTargetType = "election" | "candidate" | "invite" | "vote";

export type ElectionRecord = Readonly<{
  electionId: ElectionId;
  title: string;
  description: string;
  adminWalletAddress: `0x${string}`;
  startAt: string;
  endAt: string;
  status: ElectionMetadataStatus;
  inviteTokenHash?: Hex32;
  createdAt: string;
  updatedAt: string;
}>;

export type CandidateRecord = Readonly<{
  candidateId: CandidateId;
  electionId: ElectionId;
  name: string;
  photoUrl: string;
  metadataHash: Hex32;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}>;

export type InviteRecord = Readonly<{
  inviteId: Hex32;
  electionId: ElectionId;
  tokenHash: Hex32;
  expiresAt: string;
  status: InviteStatus;
  createdBy: `0x${string}`;
  createdAt: string;
  updatedAt: string;
}>;

export type AuditLogRecord = Readonly<{
  logId: Hex32;
  actorWalletAddress: `0x${string}`;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  metadata: JsonObject;
  createdAt: string;
}>;

export type CreateElectionInput = Readonly<{
  electionId?: string;
  title: string;
  description: string;
  adminWalletAddress: string;
  startAt: string;
  endAt: string;
}>;

export type UpdateElectionInput = Partial<
  Pick<ElectionRecord, "title" | "description" | "adminWalletAddress" | "startAt" | "endAt" | "status">
>;

export type CreateCandidateInput = Readonly<{
  candidateId?: string;
  name: string;
  photoUrl: string;
  metadataHash: string;
  displayOrder?: number;
}>;

export type UpdateCandidateInput = Partial<
  Pick<CandidateRecord, "name" | "photoUrl" | "metadataHash" | "displayOrder">
>;

export type CreateInviteInput = Readonly<{
  expiresAt: string;
  createdBy: string;
}>;

export type CreateInviteResult = Readonly<{
  invite: InviteRecord;
  token: string;
}>;

export class MetadataError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MetadataError";
    this.status = status;
  }
}

const textEncoder = new TextEncoder();
const MAX_DISPLAY_ORDER = 99_999_999;

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const generateHex32 = (): Hex32 => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return assertHex32(`0x${bytesToHex(bytes)}`);
};

const generateInviteToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return bytesToHex(bytes);
};

export const hashInviteToken = async (token: string): Promise<Hex32> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(`sepolia-voting-invite:${token}`),
  );

  return assertHex32(`0x${bytesToHex(new Uint8Array(digest))}`);
};

export const createCandidateMetadataCanonicalJson = (
  candidate: Pick<CandidateRecord, "name" | "photoUrl">,
) => JSON.stringify({ name: candidate.name, photoUrl: candidate.photoUrl });

export const KV_KEYS = {
  auditLog: (createdAt: string, logId: string) =>
    `audit-log:${createdAt}:${logId}`,
  candidate: (electionId: string, candidateId: string) =>
    `candidate:${electionId}:${candidateId}`,
  candidateIndex: (
    electionId: string,
    displayOrder: number,
    candidateId: string,
  ) =>
    `candidate-index:${electionId}:${displayOrder
      .toString()
      .padStart(8, "0")}:${candidateId}`,
  election: (electionId: string) => `election:${electionId}`,
  electionIndex: (createdAt: string, electionId: string) =>
    `election-index:created:${createdAt}:${electionId}`,
  invite: (inviteId: string) => `invite:${inviteId}`,
  inviteIndex: (electionId: string, createdAt: string, inviteId: string) =>
    `invite-index:${electionId}:${createdAt}:${inviteId}`,
  inviteToken: (tokenHash: string) => `invite-token:${tokenHash}`,
} as const;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const assertJsonObject = (value: unknown, label = "body") => {
  if (!isRecord(value)) {
    throw new MetadataError(`${label} must be an object`);
  }

  return value;
};

const requireString = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MetadataError(`${label} is required`);
  }

  return value.trim();
};

const optionalString = (value: unknown, label: string) => {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, label);
};

const requireIsoDate = (value: unknown, label: string) => {
  const dateText = requireString(value, label);
  const date = new Date(dateText);

  if (Number.isNaN(date.getTime())) {
    throw new MetadataError(`${label} must be a valid date`);
  }

  return date.toISOString();
};

const assertChronologicalRange = (startAt: string, endAt: string) => {
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    throw new MetadataError("endAt must be later than startAt");
  }
};

const requireUrl = (value: unknown, label: string) => {
  const urlText = requireString(value, label);

  try {
    const url = new URL(urlText);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new MetadataError(`${label} must be an http or https URL`);
  }

  return urlText;
};

const requireInteger = (value: unknown, label: string) => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_DISPLAY_ORDER
  ) {
    throw new MetadataError(
      `${label} must be an integer between 0 and ${MAX_DISPLAY_ORDER}`,
    );
  }

  return value;
};

const normalizeAddress = (value: unknown, label: string) =>
  assertAddress(requireString(value, label).toLowerCase(), label);

const normalizeOptionalAddress = (value: unknown, label: string) => {
  if (value === undefined) {
    return undefined;
  }

  return normalizeAddress(value, label);
};

const normalizeHex32 = (value: unknown, label: string) =>
  assertHex32(requireString(value, label).toLowerCase(), label);

const normalizeOptionalHex32 = (value: unknown, label: string) => {
  if (value === undefined) {
    return undefined;
  }

  return normalizeHex32(value, label);
};

const normalizeElectionStatus = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "candidate_registration" ||
    value === "ready" ||
    value === "active" ||
    value === "ended" ||
    value === "archived"
  ) {
    return value;
  }

  throw new MetadataError("status is invalid");
};

const getJson = async <T>(kv: KVNamespace, key: string) => {
  const value = await kv.get(key);

  if (value === null) {
    return null;
  }

  return JSON.parse(value) as T;
};

const putJson = (kv: KVNamespace, key: string, value: unknown) =>
  kv.put(key, JSON.stringify(value));

const listKeyNames = async (kv: KVNamespace, prefix: string) => {
  const names: string[] = [];
  let cursor: string | undefined;
  let complete = false;

  while (!complete) {
    const page = await kv.list({ cursor, prefix });
    names.push(...page.keys.map((key) => key.name));

    if (page.list_complete) {
      cursor = undefined;
      complete = true;
    } else {
      cursor = page.cursor;
      complete = !cursor;
    }
  }

  return names;
};

const requireElectionRecord = async (kv: KVNamespace, electionId: string) => {
  const election = await getJson<ElectionRecord>(kv, KV_KEYS.election(electionId));

  if (!election) {
    throw new MetadataError("Election not found", 404);
  }

  return election;
};

const requireCandidateRecord = async (
  kv: KVNamespace,
  electionId: string,
  candidateId: string,
) => {
  const candidate = await getJson<CandidateRecord>(
    kv,
    KV_KEYS.candidate(electionId, candidateId),
  );

  if (!candidate) {
    throw new MetadataError("Candidate not found", 404);
  }

  return candidate;
};

const isElectionStarted = (election: ElectionRecord, now: Date) =>
  now.getTime() >= Date.parse(election.startAt);

export class MetadataStore {
  readonly kv: KVNamespace;
  readonly now: () => Date;

  constructor(kv: KVNamespace, now: () => Date = () => new Date()) {
    this.kv = kv;
    this.now = now;
  }

  async createElection(input: CreateElectionInput) {
    const electionId = normalizeOptionalHex32(input.electionId, "electionId") ?? generateHex32();
    const startAt = requireIsoDate(input.startAt, "startAt");
    const endAt = requireIsoDate(input.endAt, "endAt");
    assertChronologicalRange(startAt, endAt);

    const existing = await getJson<ElectionRecord>(
      this.kv,
      KV_KEYS.election(electionId),
    );

    if (existing) {
      throw new MetadataError("Election already exists", 409);
    }

    const createdAt = this.now().toISOString();
    const election: ElectionRecord = {
      electionId,
      title: requireString(input.title, "title"),
      description: requireString(input.description, "description"),
      adminWalletAddress: normalizeAddress(
        input.adminWalletAddress,
        "adminWalletAddress",
      ),
      startAt,
      endAt,
      status: "candidate_registration",
      createdAt,
      updatedAt: createdAt,
    };

    await putJson(this.kv, KV_KEYS.election(electionId), election);
    await putJson(this.kv, KV_KEYS.electionIndex(createdAt, electionId), {
      electionId,
    });
    await this.recordAuditLog({
      actorWalletAddress: election.adminWalletAddress,
      action: "election.create",
      targetType: "election",
      targetId: electionId,
      metadata: { electionId },
    });

    return election;
  }

  async listElections() {
    const keys = await listKeyNames(this.kv, "election-index:created:");
    const elections = await Promise.all(
      keys.map(async (key) => {
        const index = await getJson<{ electionId: string }>(this.kv, key);

        return index ? this.getElection(index.electionId) : null;
      }),
    );

    return elections.filter((election): election is ElectionRecord => election !== null);
  }

  async getElection(electionId: string) {
    return requireElectionRecord(this.kv, normalizeHex32(electionId, "electionId"));
  }

  async updateElection(
    electionIdValue: string,
    input: UpdateElectionInput,
    actorWalletAddress?: `0x${string}`,
  ) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const current = await requireElectionRecord(this.kv, electionId);
    const startAt = input.startAt
      ? requireIsoDate(input.startAt, "startAt")
      : current.startAt;
    const endAt = input.endAt ? requireIsoDate(input.endAt, "endAt") : current.endAt;
    assertChronologicalRange(startAt, endAt);

    const updated: ElectionRecord = {
      ...current,
      title: optionalString(input.title, "title") ?? current.title,
      description:
        optionalString(input.description, "description") ?? current.description,
      adminWalletAddress:
        normalizeOptionalAddress(input.adminWalletAddress, "adminWalletAddress") ??
        current.adminWalletAddress,
      startAt,
      endAt,
      status: normalizeElectionStatus(input.status) ?? current.status,
      updatedAt: this.now().toISOString(),
    };

    await putJson(this.kv, KV_KEYS.election(electionId), updated);
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? current.adminWalletAddress,
      action: "election.update",
      targetType: "election",
      targetId: electionId,
      metadata: { electionId },
    });

    return updated;
  }

  async deleteElection(
    electionIdValue: string,
    actorWalletAddress?: `0x${string}`,
  ) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const election = await requireElectionRecord(this.kv, electionId);
    const candidateIndexKeys = await listKeyNames(
      this.kv,
      `candidate-index:${electionId}:`,
    );
    const inviteIndexKeys = await listKeyNames(this.kv, `invite-index:${electionId}:`);

    await Promise.all(
      candidateIndexKeys.map(async (indexKey) => {
        const index = await getJson<{ candidateId: string }>(this.kv, indexKey);
        if (index) {
          await this.kv.delete(KV_KEYS.candidate(electionId, index.candidateId));
        }
        await this.kv.delete(indexKey);
      }),
    );

    await Promise.all(
      inviteIndexKeys.map(async (indexKey) => {
        const index = await getJson<{ inviteId: string }>(this.kv, indexKey);
        if (index) {
          const invite = await getJson<InviteRecord>(
            this.kv,
            KV_KEYS.invite(index.inviteId),
          );
          if (invite) {
            await this.kv.delete(KV_KEYS.inviteToken(invite.tokenHash));
          }
          await this.kv.delete(KV_KEYS.invite(index.inviteId));
        }
        await this.kv.delete(indexKey);
      }),
    );

    await this.kv.delete(KV_KEYS.election(electionId));
    await this.kv.delete(KV_KEYS.electionIndex(election.createdAt, electionId));
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? election.adminWalletAddress,
      action: "election.delete",
      targetType: "election",
      targetId: electionId,
      metadata: { electionId },
    });
  }

  async createCandidate(
    electionIdValue: string,
    input: CreateCandidateInput,
    actorWalletAddress?: `0x${string}`,
  ) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const election = await requireElectionRecord(this.kv, electionId);

    if (isElectionStarted(election, this.now())) {
      throw new MetadataError("Candidates cannot be changed after election start", 409);
    }

    const candidateId =
      normalizeOptionalHex32(input.candidateId, "candidateId") ?? generateHex32();
    const existing = await getJson<CandidateRecord>(
      this.kv,
      KV_KEYS.candidate(electionId, candidateId),
    );

    if (existing) {
      throw new MetadataError("Candidate already exists", 409);
    }

    const createdAt = this.now().toISOString();
    const name = requireString(input.name, "name");
    const photoUrl = requireUrl(input.photoUrl, "photoUrl");
    const metadataHash = normalizeHex32(input.metadataHash, "metadataHash");

    if (metadataHash !== createCandidateMetadataHash({ name, photoUrl })) {
      throw new MetadataError("metadataHash does not match candidate metadata");
    }

    const candidate: CandidateRecord = {
      candidateId,
      electionId,
      name,
      photoUrl,
      metadataHash,
      displayOrder:
        input.displayOrder === undefined
          ? (await this.listCandidates(electionId)).length
          : requireInteger(input.displayOrder, "displayOrder"),
      createdAt,
      updatedAt: createdAt,
    };

    await putJson(this.kv, KV_KEYS.candidate(electionId, candidateId), candidate);
    await putJson(
      this.kv,
      KV_KEYS.candidateIndex(electionId, candidate.displayOrder, candidateId),
      { candidateId },
    );
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? election.adminWalletAddress,
      action: "candidate.create",
      targetType: "candidate",
      targetId: candidateId,
      metadata: { candidateId, electionId },
    });

    return candidate;
  }

  async listCandidates(electionIdValue: string) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    await requireElectionRecord(this.kv, electionId);
    const keys = await listKeyNames(this.kv, `candidate-index:${electionId}:`);
    const candidates = await Promise.all(
      keys.map(async (key) => {
        const index = await getJson<{ candidateId: string }>(this.kv, key);

        return index
          ? getJson<CandidateRecord>(
              this.kv,
              KV_KEYS.candidate(electionId, index.candidateId),
            )
          : null;
      }),
    );

    return candidates.filter(
      (candidate): candidate is CandidateRecord => candidate !== null,
    );
  }

  async getCandidate(electionIdValue: string, candidateIdValue: string) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const candidateId = normalizeHex32(candidateIdValue, "candidateId");
    await requireElectionRecord(this.kv, electionId);

    return requireCandidateRecord(this.kv, electionId, candidateId);
  }

  async updateCandidate(
    electionIdValue: string,
    candidateIdValue: string,
    input: UpdateCandidateInput,
    actorWalletAddress?: `0x${string}`,
  ) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const candidateId = normalizeHex32(candidateIdValue, "candidateId");
    const election = await requireElectionRecord(this.kv, electionId);

    if (isElectionStarted(election, this.now())) {
      throw new MetadataError("Candidates cannot be changed after election start", 409);
    }

    const current = await requireCandidateRecord(this.kv, electionId, candidateId);
    const nextName = optionalString(input.name, "name") ?? current.name;
    const nextPhotoUrl = input.photoUrl
      ? requireUrl(input.photoUrl, "photoUrl")
      : current.photoUrl;
    const metadataChanged =
      nextName !== current.name || nextPhotoUrl !== current.photoUrl;

    if (metadataChanged && input.metadataHash === undefined) {
      throw new MetadataError(
        "metadataHash is required when candidate display metadata changes",
      );
    }

    const nextMetadataHash =
      normalizeOptionalHex32(input.metadataHash, "metadataHash") ??
      current.metadataHash;

    if (
      nextMetadataHash !==
      createCandidateMetadataHash({ name: nextName, photoUrl: nextPhotoUrl })
    ) {
      throw new MetadataError("metadataHash does not match candidate metadata");
    }

    const displayOrder =
      input.displayOrder === undefined
        ? current.displayOrder
        : requireInteger(input.displayOrder, "displayOrder");
    const updated: CandidateRecord = {
      ...current,
      name: nextName,
      photoUrl: nextPhotoUrl,
      metadataHash: nextMetadataHash,
      displayOrder,
      updatedAt: this.now().toISOString(),
    };

    if (displayOrder !== current.displayOrder) {
      await this.kv.delete(
        KV_KEYS.candidateIndex(electionId, current.displayOrder, candidateId),
      );
      await putJson(
        this.kv,
        KV_KEYS.candidateIndex(electionId, displayOrder, candidateId),
        { candidateId },
      );
    }

    await putJson(this.kv, KV_KEYS.candidate(electionId, candidateId), updated);
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? election.adminWalletAddress,
      action: "candidate.update",
      targetType: "candidate",
      targetId: candidateId,
      metadata: { candidateId, electionId },
    });

    return updated;
  }

  async deleteCandidate(
    electionIdValue: string,
    candidateIdValue: string,
    actorWalletAddress?: `0x${string}`,
  ) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const candidateId = normalizeHex32(candidateIdValue, "candidateId");
    const election = await requireElectionRecord(this.kv, electionId);

    if (isElectionStarted(election, this.now())) {
      throw new MetadataError("Candidates cannot be changed after election start", 409);
    }

    const candidate = await requireCandidateRecord(this.kv, electionId, candidateId);
    await this.kv.delete(KV_KEYS.candidate(electionId, candidateId));
    await this.kv.delete(
      KV_KEYS.candidateIndex(electionId, candidate.displayOrder, candidateId),
    );
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? election.adminWalletAddress,
      action: "candidate.delete",
      targetType: "candidate",
      targetId: candidateId,
      metadata: { candidateId, electionId },
    });
  }

  async createInvite(electionIdValue: string, input: CreateInviteInput) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    const election = await requireElectionRecord(this.kv, electionId);
    const expiresAt = requireIsoDate(input.expiresAt, "expiresAt");
    const candidates = await this.listCandidates(electionId);

    if (candidates.length < 2) {
      throw new MetadataError("At least two candidates are required before creating invites", 409);
    }

    if (Date.parse(expiresAt) <= this.now().getTime()) {
      throw new MetadataError("expiresAt must be in the future");
    }

    const token = generateInviteToken();
    const tokenHash = await hashInviteToken(token);
    const inviteId = generateHex32();
    const createdAt = this.now().toISOString();
    const invite: InviteRecord = {
      inviteId,
      electionId,
      tokenHash,
      expiresAt,
      status: "active",
      createdBy: normalizeAddress(input.createdBy, "createdBy"),
      createdAt,
      updatedAt: createdAt,
    };

    await putJson(this.kv, KV_KEYS.invite(inviteId), invite);
    await putJson(this.kv, KV_KEYS.inviteToken(tokenHash), { inviteId });
    await putJson(this.kv, KV_KEYS.inviteIndex(electionId, createdAt, inviteId), {
      inviteId,
    });
    await putJson(this.kv, KV_KEYS.election(electionId), {
      ...election,
      inviteTokenHash: tokenHash,
      updatedAt: createdAt,
    } satisfies ElectionRecord);
    await this.recordAuditLog({
      actorWalletAddress: invite.createdBy,
      action: "invite.create",
      targetType: "invite",
      targetId: inviteId,
      metadata: { electionId, inviteId },
    });

    return { invite, token } satisfies CreateInviteResult;
  }

  async listInvites(electionIdValue: string) {
    const electionId = normalizeHex32(electionIdValue, "electionId");
    await requireElectionRecord(this.kv, electionId);
    const keys = await listKeyNames(this.kv, `invite-index:${electionId}:`);
    const invites = await Promise.all(
      keys.map(async (key) => {
        const index = await getJson<{ inviteId: string }>(this.kv, key);

        return index ? this.getInvite(index.inviteId) : null;
      }),
    );

    return invites.filter((invite): invite is InviteRecord => invite !== null);
  }

  async getInvite(inviteIdValue: string) {
    const inviteId = normalizeHex32(inviteIdValue, "inviteId");
    const invite = await getJson<InviteRecord>(this.kv, KV_KEYS.invite(inviteId));

    if (!invite) {
      throw new MetadataError("Invite not found", 404);
    }

    return this.materializeInviteStatus(invite);
  }

  async validateInviteToken(token: string) {
    const tokenHash = await hashInviteToken(requireString(token, "token"));
    const index = await getJson<{ inviteId: string }>(
      this.kv,
      KV_KEYS.inviteToken(tokenHash),
    );

    if (!index) {
      throw new MetadataError("Invite token is invalid", 404);
    }

    const invite = await getJson<InviteRecord>(this.kv, KV_KEYS.invite(index.inviteId));

    if (!invite) {
      throw new MetadataError("Invite token is invalid", 404);
    }

    const currentInvite = await this.materializeInviteStatus(invite);

    if (currentInvite.status === "disabled") {
      throw new MetadataError("Invite token is invalid", 404);
    }

    if (currentInvite.status === "expired") {
      throw new MetadataError("Invite token is expired", 403);
    }

    const election = await requireElectionRecord(this.kv, currentInvite.electionId);

    return { election, invite: currentInvite };
  }

  async disableInvite(
    inviteIdValue: string,
    actorWalletAddress?: `0x${string}`,
  ) {
    const inviteId = normalizeHex32(inviteIdValue, "inviteId");
    const invite = await getJson<InviteRecord>(this.kv, KV_KEYS.invite(inviteId));

    if (!invite) {
      throw new MetadataError("Invite not found", 404);
    }

    const updated: InviteRecord = {
      ...invite,
      status: "disabled",
      updatedAt: this.now().toISOString(),
    };

    await putJson(this.kv, KV_KEYS.invite(inviteId), updated);
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? invite.createdBy,
      action: "invite.disable",
      targetType: "invite",
      targetId: inviteId,
      metadata: { electionId: invite.electionId, inviteId },
    });

    return updated;
  }

  async deleteInvite(
    inviteIdValue: string,
    actorWalletAddress?: `0x${string}`,
  ) {
    const inviteId = normalizeHex32(inviteIdValue, "inviteId");
    const invite = await getJson<InviteRecord>(this.kv, KV_KEYS.invite(inviteId));

    if (!invite) {
      throw new MetadataError("Invite not found", 404);
    }

    await this.kv.delete(KV_KEYS.invite(inviteId));
    await this.kv.delete(KV_KEYS.inviteToken(invite.tokenHash));
    await this.kv.delete(
      KV_KEYS.inviteIndex(invite.electionId, invite.createdAt, inviteId),
    );
    await this.recordAuditLog({
      actorWalletAddress: actorWalletAddress ?? invite.createdBy,
      action: "invite.delete",
      targetType: "invite",
      targetId: inviteId,
      metadata: { electionId: invite.electionId, inviteId },
    });
  }

  async listAuditLogs() {
    const keys = await listKeyNames(this.kv, "audit-log:");
    const logs = await Promise.all(
      keys.map((key) => getJson<AuditLogRecord>(this.kv, key)),
    );

    return logs.filter((log): log is AuditLogRecord => log !== null);
  }

  async recordAuditLog(input: Omit<AuditLogRecord, "createdAt" | "logId">) {
    if (!isAddress(input.actorWalletAddress)) {
      throw new MetadataError("actorWalletAddress must be a 20-byte hex address");
    }

    const logId = generateHex32();
    const createdAt = this.now().toISOString();
    const log: AuditLogRecord = {
      logId,
      actorWalletAddress: input.actorWalletAddress.toLowerCase() as `0x${string}`,
      action: requireString(input.action, "action"),
      targetType: input.targetType,
      targetId: requireString(input.targetId, "targetId"),
      metadata: input.metadata,
      createdAt,
    };

    if (!isHex32(log.logId)) {
      throw new MetadataError("logId must be a 32-byte hex string");
    }

    await putJson(this.kv, KV_KEYS.auditLog(createdAt, logId), log);

    return log;
  }

  private async materializeInviteStatus(invite: InviteRecord) {
    if (
      invite.status !== "active" ||
      Date.parse(invite.expiresAt) > this.now().getTime()
    ) {
      return invite;
    }

    const expired: InviteRecord = {
      ...invite,
      status: "expired",
      updatedAt: this.now().toISOString(),
    };

    await putJson(this.kv, KV_KEYS.invite(invite.inviteId), expired);

    return expired;
  }
}
