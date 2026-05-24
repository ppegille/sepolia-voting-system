import {
  getVotingApiBaseUrl,
  type CandidateRecord,
  type ElectionRecord,
  type InviteRecord,
  type VoteRecord,
} from "../admin/admin-api";
import { assertAddress, assertHex32 } from "../contracts/voting-contract";

type ApiSuccess<T> = Readonly<{ ok: true; data: T }>;
type ApiFailure = Readonly<{ ok: false; error: string }>;
type ApiPayload<T> = ApiSuccess<T> | ApiFailure;

export type ValidatedInvite = Readonly<{
  election: ElectionRecord;
  invite: InviteRecord;
}>;

export type VoteInvitePackage = Readonly<{
  candidates: CandidateRecord[];
  election: ElectionRecord;
  invite: InviteRecord;
}>;

export type ElectionTimeStatus = "not_started" | "active" | "ended";
export type VoteTransactionStatus = "submitted" | "success" | "failed";

export type VoteTransactionRecordInput = Readonly<{
  electionId: string;
  candidateId: string;
  voterWalletAddress: string;
  status: VoteTransactionStatus;
  transactionHash?: string;
  failureReason?: string;
}>;

export class VoteApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VoteApiError";
    this.status = status;
  }
}

const parseJsonResponse = async <T>(response: Response) => {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || !payload.ok) {
    throw new VoteApiError(
      payload.ok ? "API request failed" : payload.error,
      response.status,
    );
  }

  return payload.data;
};

const postJson = async <T>(path: string, body: unknown, fetcher: typeof fetch) => {
  const response = await fetcher(`${getVotingApiBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return parseJsonResponse<T>(response);
};

const getJson = async <T>(path: string, fetcher: typeof fetch) => {
  const response = await fetcher(`${getVotingApiBaseUrl()}${path}`);

  return parseJsonResponse<T>(response);
};

export const validateInviteToken = async (
  tokenValue: string,
  fetcher: typeof fetch = fetch,
) => {
  const token = tokenValue.trim();

  if (!token) {
    throw new VoteApiError("Invite token is required", 400);
  }

  return postJson<ValidatedInvite>("/invites/validate", { token }, fetcher);
};

export const loadVoteInvitePackage = async (
  token: string,
  fetcher: typeof fetch = fetch,
) => {
  const validated = await validateInviteToken(token, fetcher);
  const candidates = await getJson<CandidateRecord[]>(
    `/elections/${validated.election.electionId}/candidates`,
    fetcher,
  );

  return {
    ...validated,
    candidates: [...candidates].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    ),
  } satisfies VoteInvitePackage;
};

export const recordVoteTransaction = async (
  input: VoteTransactionRecordInput,
  fetcher: typeof fetch = fetch,
) =>
  postJson<VoteRecord>(
    "/vote-records",
    {
      candidateId: assertHex32(input.candidateId, "candidateId"),
      electionId: assertHex32(input.electionId, "electionId"),
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
      status: input.status,
      ...(input.transactionHash
        ? { transactionHash: assertHex32(input.transactionHash, "transactionHash") }
        : {}),
      voterWalletAddress: assertAddress(
        input.voterWalletAddress.toLowerCase(),
        "voterWalletAddress",
      ),
    },
    fetcher,
  );

export const getElectionTimeStatus = (
  election: Pick<ElectionRecord, "endAt" | "startAt">,
  now: Date = new Date(),
): ElectionTimeStatus => {
  const nowMs = now.getTime();

  if (nowMs < Date.parse(election.startAt)) {
    return "not_started";
  }
  if (nowMs >= Date.parse(election.endAt)) {
    return "ended";
  }

  return "active";
};

export const isVoteCandidateThresholdMet = (candidateCount: number) =>
  candidateCount >= 2;
