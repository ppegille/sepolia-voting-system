import { keccak256, stringToHex } from "viem";

export type AdminSignatureMessageInput = Readonly<{
  actorWalletAddress: string;
  issuedAt: string;
  method: string;
  path: string;
  bodyHash: string;
}>;

export const ADMIN_SIGNATURE_MESSAGE_PREFIX =
  "Sepolia Voting Admin Request";

export const hashAdminRequestBody = (bodyText: string) =>
  keccak256(stringToHex(bodyText));

export const createAdminSignatureMessage = ({
  actorWalletAddress,
  bodyHash,
  issuedAt,
  method,
  path,
}: AdminSignatureMessageInput) =>
  [
    ADMIN_SIGNATURE_MESSAGE_PREFIX,
    `Actor: ${actorWalletAddress.toLowerCase()}`,
    `IssuedAt: ${issuedAt}`,
    `Method: ${method.toUpperCase()}`,
    `Path: ${path}`,
    `BodyHash: ${bodyHash}`,
  ].join("\n");
