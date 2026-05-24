import {
  getVotingApiBaseUrl,
  type CandidateRecord,
  type ElectionRecord,
} from "../admin/admin-api";
import { assertHex32, type ElectionId } from "../contracts/voting-contract";

type ApiSuccess<T> = Readonly<{ ok: true; data: T }>;
type ApiFailure = Readonly<{ ok: false; error: string }>;
type ApiPayload<T> = ApiSuccess<T> | ApiFailure;

export type ResultMetadataPackage = Readonly<{
  candidates: CandidateRecord[];
  election: ElectionRecord;
}>;

export class ResultApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ResultApiError";
    this.status = status;
  }
}

const parseJsonResponse = async <T>(response: Response) => {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || !payload.ok) {
    throw new ResultApiError(
      payload.ok ? "API request failed" : payload.error,
      response.status,
    );
  }

  return payload.data;
};

const getJson = async <T>(path: string, fetcher: typeof fetch) => {
  const response = await fetcher(`${getVotingApiBaseUrl()}${path}`);

  return parseJsonResponse<T>(response);
};

export const loadResultMetadataPackage = async (
  electionIdValue: string,
  fetcher: typeof fetch = fetch,
) => {
  const electionId = assertHex32(electionIdValue, "electionId");
  const [election, candidates] = await Promise.all([
    getJson<ElectionRecord>(`/elections/${electionId}`, fetcher),
    getJson<CandidateRecord[]>(`/elections/${electionId}/candidates`, fetcher),
  ]);

  return {
    candidates: [...candidates].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    ),
    election,
  } satisfies ResultMetadataPackage;
};

export const createResultShareUrl = (origin: string, electionIdValue: string) => {
  const electionId = assertHex32(electionIdValue, "electionId");
  const url = new URL("/results", origin);
  url.searchParams.set("electionId", electionId);

  return url.toString();
};

export const createVerificationUrl = (
  origin: string,
  electionIdValue: string,
  transactionHashValue?: string,
) => {
  const electionId = assertHex32(electionIdValue, "electionId");
  const url = new URL("/verify", origin);
  url.searchParams.set("electionId", electionId);

  if (transactionHashValue) {
    url.searchParams.set(
      "tx",
      assertHex32(transactionHashValue, "transactionHash"),
    );
  }

  return url.toString();
};

export const normalizeResultElectionId = (value: string | null): ElectionId => {
  if (!value) {
    throw new ResultApiError("electionId query parameter is required", 400);
  }

  return assertHex32(value, "electionId");
};

export const normalizeOptionalTransactionHash = (value: string | null) =>
  value ? assertHex32(value, "transactionHash") : null;
