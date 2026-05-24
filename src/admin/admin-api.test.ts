import { describe, expect, it, vi } from "vitest";

import {
  createElection,
  createCandidateMetadataCanonicalJson,
  createCandidateMetadataHash,
  createInviteShareUrl,
  isReadyForInvite,
} from "./admin-api";
import { ADMIN_SIGNATURE_MESSAGE_PREFIX } from "./admin-auth";

describe("admin api helpers", () => {
  it("creates canonical candidate metadata for future onchain hashing", () => {
    expect(
      createCandidateMetadataCanonicalJson({
        name: " Alice ",
        photoUrl: " https://example.com/alice.png ",
      }),
    ).toBe(
      JSON.stringify({
        name: "Alice",
        photoUrl: "https://example.com/alice.png",
      }),
    );
  });

  it("hashes candidate metadata with Ethereum keccak256", () => {
    expect(
      createCandidateMetadataHash({
        name: "Alice",
        photoUrl: "https://example.com/alice.png",
      }),
    ).toBe("0x693137639d1d0d15faea7701e93d66956a6d837befb43a005df14b53c0cb1c69");
  });

  it("builds share URLs without storing raw invite tokens", () => {
    expect(createInviteShareUrl("https://example.com", "secret-token")).toBe(
      "https://example.com/vote?invite=secret-token",
    );
  });

  it("requires at least two candidates before invite sharing is ready", () => {
    expect(isReadyForInvite(0)).toBe(false);
    expect(isReadyForInvite(1)).toBe(false);
    expect(isReadyForInvite(2)).toBe(true);
  });

  it("signs admin write requests with the request body hash", async () => {
    let capturedInit: RequestInit | undefined;
    const signer = vi.fn(async (message: string) => {
      expect(message).toContain(ADMIN_SIGNATURE_MESSAGE_PREFIX);

      return "0x1234" as `0x${string}`;
    });
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;

      return Response.json(
        {
          ok: true,
          data: {
            adminWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            createdAt: "2098-12-01T00:00:00.000Z",
            description: "Pick one candidate.",
            electionId:
              "0x1111111111111111111111111111111111111111111111111111111111111111",
            endAt: "2099-01-02T00:00:00.000Z",
            startAt: "2099-01-01T00:00:00.000Z",
            status: "candidate_registration",
            title: "Student Council Election",
            updatedAt: "2098-12-01T00:00:00.000Z",
          },
        },
        { status: 201 },
      );
    }) as typeof fetch;

    await createElection(
      {
        description: "Pick one candidate.",
        endAt: "2099-01-02T00:00:00.000Z",
        startAt: "2099-01-01T00:00:00.000Z",
        title: "Student Council Election",
      },
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      signer,
      fetcher,
    );

    const signedMessage = signer.mock.calls[0]?.[0] ?? "";
    const headers = capturedInit?.headers as Record<string, string>;

    expect(signedMessage).toContain(
      "Actor: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(signedMessage).toContain("IssuedAt: ");
    expect(signedMessage).toContain("Method: POST");
    expect(signedMessage).toContain("Path: /elections");
    expect(signedMessage).toContain("BodyHash: 0x");
    expect(headers["X-Actor-Message"]).toBe(encodeURIComponent(signedMessage));
    expect(headers["X-Actor-Signature"]).toBe("0x1234");
  });
});
