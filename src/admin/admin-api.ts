import {
  assertAddress,
  assertHex32,
  type Hex32,
} from "../contracts/voting-contract";
import {
  createAdminSignatureMessage,
  hashAdminRequestBody,
} from "./admin-auth";
export {
  createCandidateMetadataCanonicalJson,
  createCandidateMetadataHash,
} from "./candidate-metadata";
import { createCandidateMetadataHash } from "./candidate-metadata";

export const DEFAULT_VOTING_API_BASE_URL =
  "https://sepolia-voting-api.hadoo6487.workers.dev";
export const LOCAL_VOTING_API_BASE_URL = "http://localhost:8787";
const LOCAL_FRONTEND_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

export type ElectionMetadataStatus =
  | "candidate_registration"
  | "ready"
  | "active"
  | "ended"
  | "archived";

export type ElectionRecord = Readonly<{
  electionId: Hex32;
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
  candidateId: Hex32;
  electionId: Hex32;
  name: string;
  photoUrl: string;
  metadataHash: Hex32;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}>;

export type InviteRecord = Readonly<{
  inviteId: Hex32;
  electionId: Hex32;
  tokenHash: Hex32;
  expiresAt: string;
  status: "active" | "expired" | "disabled";
  createdBy: `0x${string}`;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateInviteResponse = Readonly<{
  invite: InviteRecord;
  token: string;
}>;

export type CreateElectionForm = Readonly<{
  title: string;
  description: string;
  startAt: string;
  endAt: string;
}>;

export type CreateCandidateForm = Readonly<{
  name: string;
  photoUrl: string;
  displayOrder: number;
}>;

export type CreateInviteForm = Readonly<{
  expiresAt: string;
}>;

export type AdminRequestSigner = (message: string) => Promise<`0x${string}`>;

type ApiSuccess<T> = Readonly<{ ok: true; data: T }>;
type ApiFailure = Readonly<{ ok: false; error: string }>;
type ApiPayload<T> = ApiSuccess<T> | ApiFailure;

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const generateHex32 = (cryptoSource: Crypto = crypto): Hex32 => {
  const bytes = new Uint8Array(32);
  cryptoSource.getRandomValues(bytes);

  return assertHex32(`0x${bytesToHex(bytes)}`);
};

export const createInviteShareUrl = (origin: string, token: string) => {
  const url = new URL("/vote", origin);
  url.searchParams.set("invite", token);

  return url.toString();
};

export const getVotingApiBaseUrl = () =>
  (
    process.env.NEXT_PUBLIC_VOTING_API_BASE_URL ??
    (typeof window !== "undefined" &&
    LOCAL_FRONTEND_HOSTNAMES.has(window.location.hostname)
      ? LOCAL_VOTING_API_BASE_URL
      : DEFAULT_VOTING_API_BASE_URL)
  ).replace(/\/$/, "");

const parseJsonResponse = async <T>(response: Response) => {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || !payload.ok) {
    throw new AdminApiError(
      payload.ok ? "API request failed" : payload.error,
      response.status,
    );
  }

  return payload.data;
};

const requestJson = async <T>(
  path: string,
  actorWalletAddress: `0x${string}`,
  init: RequestInit & { body: string; method: string },
  fetcher: typeof fetch,
  signer: AdminRequestSigner,
) => {
  const bodyHash = hashAdminRequestBody(init.body);
  const message = createAdminSignatureMessage({
    actorWalletAddress,
    bodyHash,
    issuedAt: new Date().toISOString(),
    method: init.method,
    path,
  });
  const signature = await signer(message);
  const response = await fetcher(`${getVotingApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Actor-Message": encodeURIComponent(message),
      "X-Actor-Signature": signature,
      "X-Actor-Wallet": actorWalletAddress,
      ...init.headers,
    },
  });

  return parseJsonResponse<T>(response);
};

export const createElection = async (
  form: CreateElectionForm,
  adminWalletAddressValue: string,
  signer: AdminRequestSigner,
  fetcher: typeof fetch = fetch,
) => {
  const adminWalletAddress = assertAddress(
    adminWalletAddressValue.toLowerCase(),
    "adminWalletAddress",
  );
  const electionId = generateHex32();

  const path = "/elections";
  const body = JSON.stringify({
        adminWalletAddress,
        description: form.description.trim(),
        electionId,
        endAt: new Date(form.endAt).toISOString(),
        startAt: new Date(form.startAt).toISOString(),
        title: form.title.trim(),
      });

  return requestJson<ElectionRecord>(
    path,
    adminWalletAddress,
    {
      body,
      method: "POST",
    },
    fetcher,
    signer,
  );
};

export const createCandidate = async (
  electionIdValue: string,
  form: CreateCandidateForm,
  adminWalletAddressValue: string,
  signer: AdminRequestSigner,
  fetcher: typeof fetch = fetch,
) => {
  const electionId = assertHex32(electionIdValue, "electionId");
  const adminWalletAddress = assertAddress(
    adminWalletAddressValue.toLowerCase(),
    "adminWalletAddress",
  );
  const candidateId = generateHex32();
  const metadataHash = createCandidateMetadataHash(form);

  const path = `/elections/${electionId}/candidates`;
  const body = JSON.stringify({
        candidateId,
        displayOrder: form.displayOrder,
        metadataHash,
        name: form.name.trim(),
        photoUrl: form.photoUrl.trim(),
      });

  return requestJson<CandidateRecord>(
    path,
    adminWalletAddress,
    {
      body,
      method: "POST",
    },
    fetcher,
    signer,
  );
};

export const createInvite = async (
  electionIdValue: string,
  form: CreateInviteForm,
  adminWalletAddressValue: string,
  signer: AdminRequestSigner,
  fetcher: typeof fetch = fetch,
) => {
  const electionId = assertHex32(electionIdValue, "electionId");
  const adminWalletAddress = assertAddress(
    adminWalletAddressValue.toLowerCase(),
    "adminWalletAddress",
  );

  const path = `/elections/${electionId}/invites`;
  const body = JSON.stringify({
        createdBy: adminWalletAddress,
        expiresAt: new Date(form.expiresAt).toISOString(),
      });

  return requestJson<CreateInviteResponse>(
    path,
    adminWalletAddress,
    {
      body,
      method: "POST",
    },
    fetcher,
    signer,
  );
};

export const isReadyForInvite = (candidateCount: number) => candidateCount >= 2;
