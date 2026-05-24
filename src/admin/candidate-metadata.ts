import { keccak256, stringToHex } from "viem";

import { assertHex32 } from "../contracts/voting-contract";

export type CandidateDisplayMetadata = Readonly<{
  name: string;
  photoUrl: string;
}>;

export const createCandidateMetadataCanonicalJson = (
  candidate: CandidateDisplayMetadata,
) =>
  JSON.stringify({
    name: candidate.name.trim(),
    photoUrl: candidate.photoUrl.trim(),
  });

export const createCandidateMetadataHash = (
  candidate: CandidateDisplayMetadata,
) =>
  assertHex32(
    keccak256(stringToHex(createCandidateMetadataCanonicalJson(candidate))),
    "metadataHash",
  );
