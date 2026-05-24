import { network } from "hardhat";
import { describe, expect, it } from "vitest";

const { viem, networkHelpers } = await network.create();

const ELECTION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const CANDIDATE_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const SECOND_CANDIDATE_ID =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const METADATA_HASH =
  "0x693137639d1d0d15faea7701e93d66956a6d837befb43a005df14b53c0cb1c69";
const SECOND_METADATA_HASH =
  "0x2c31e8c17676d7df5b27dd0b3e858de41fc1b4784c3f48f4f691896df5fc1e6d";
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const deployVotingFixture = async () => {
  const [admin, voter, otherVoter, nonAdmin] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const currentBlock = await publicClient.getBlock();
  const startAt = currentBlock.timestamp + BigInt(100);
  const endAt = startAt + BigInt(1_000);
  const voting = await viem.deployContract("SepoliaVoting");

  return { admin, endAt, nonAdmin, otherVoter, startAt, voter, voting };
};

const createElection = async () => {
  const fixture = await networkHelpers.loadFixture(deployVotingFixture);

  await fixture.voting.write.createElection([
    ELECTION_ID,
    fixture.startAt,
    fixture.endAt,
    fixture.admin.account.address,
  ]);

  return fixture;
};

const createElectionWithCandidates = async () => {
  const fixture = await createElection();

  await fixture.voting.write.registerCandidate([
    ELECTION_ID,
    CANDIDATE_ID,
    METADATA_HASH,
  ]);
  await fixture.voting.write.registerCandidate([
    ELECTION_ID,
    SECOND_CANDIDATE_ID,
    SECOND_METADATA_HASH,
  ]);

  return fixture;
};

describe("SepoliaVoting", () => {
  it("creates timestamp-based elections and reports pending status", async () => {
    const { admin, endAt, startAt, voting } = await createElection();
    const election = await voting.read.getElection([ELECTION_ID]);

    expect(election.adminAddress.toLowerCase()).toBe(admin.account.address);
    expect(election.candidateCount).toBe(BigInt(0));
    expect(election.endAt).toBe(endAt);
    expect(election.startAt).toBe(startAt);
    await expect(voting.read.getElectionStatus([ELECTION_ID])).resolves.toBe(1);
    await expect(voting.read.getElectionStatus([ZERO_BYTES32])).resolves.toBe(0);
  });

  it("rejects invalid or duplicate elections", async () => {
    const { admin, endAt, nonAdmin, startAt, voting } =
      await networkHelpers.loadFixture(deployVotingFixture);

    await expect(
      voting.write.createElection([
        ZERO_BYTES32,
        startAt,
        endAt,
        admin.account.address,
      ]),
    ).rejects.toThrow(/InvalidElectionId/);
    await expect(
      voting.write.createElection([
        ELECTION_ID,
        startAt,
        endAt,
        "0x0000000000000000000000000000000000000000",
      ]),
    ).rejects.toThrow(/InvalidAdminAddress/);
    await expect(
      voting.write.createElection([
        ELECTION_ID,
        startAt - BigInt(200),
        endAt,
        admin.account.address,
      ]),
    ).rejects.toThrow(/InvalidTimeRange/);
    await expect(
      voting.write.createElection([ELECTION_ID, endAt, startAt, admin.account.address]),
    ).rejects.toThrow(/InvalidTimeRange/);
    await expect(
      voting.write.createElection(
        [ELECTION_ID, startAt, endAt, admin.account.address],
        { account: nonAdmin.account },
      ),
    ).rejects.toThrow(/NotElectionCreator/);

    await voting.write.createElection([
      ELECTION_ID,
      startAt,
      endAt,
      admin.account.address,
    ]);
    await expect(
      voting.write.createElection([ELECTION_ID, startAt, endAt, admin.account.address]),
    ).rejects.toThrow(/ElectionAlreadyExists/);
  });

  it("only lets the election admin register unique candidates before start", async () => {
    const { nonAdmin, startAt, voting } = await createElection();

    await expect(
      voting.write.registerCandidate([ELECTION_ID, CANDIDATE_ID, METADATA_HASH], {
        account: nonAdmin.account,
      }),
    ).rejects.toThrow(/NotElectionAdmin/);
    await expect(
      voting.write.registerCandidate([ELECTION_ID, ZERO_BYTES32, METADATA_HASH]),
    ).rejects.toThrow(/InvalidCandidateId/);
    await expect(
      voting.write.registerCandidate([ELECTION_ID, CANDIDATE_ID, ZERO_BYTES32]),
    ).rejects.toThrow(/InvalidMetadataHash/);

    await voting.write.registerCandidate([
      ELECTION_ID,
      CANDIDATE_ID,
      METADATA_HASH,
    ]);

    await expect(voting.read.getCandidates([ELECTION_ID])).resolves.toEqual([
      CANDIDATE_ID,
    ]);
    await expect(
      voting.write.registerCandidate([ELECTION_ID, CANDIDATE_ID, METADATA_HASH]),
    ).rejects.toThrow(/CandidateAlreadyExists/);

    await networkHelpers.time.increaseTo(startAt);
    await expect(
      voting.write.registerCandidate([
        ELECTION_ID,
        SECOND_CANDIDATE_ID,
        SECOND_METADATA_HASH,
      ]),
    ).rejects.toThrow(/CandidateRegistrationClosed/);
  });

  it("rejects votes outside the active period or without two candidates", async () => {
    const { startAt, voter, voting } = await createElection();

    await voting.write.registerCandidate([
      ELECTION_ID,
      CANDIDATE_ID,
      METADATA_HASH,
    ]);

    await expect(
      voting.write.vote([ELECTION_ID, CANDIDATE_ID], { account: voter.account }),
    ).rejects.toThrow(/VotingNotActive/);

    await networkHelpers.time.increaseTo(startAt);

    await expect(
      voting.write.vote([ELECTION_ID, CANDIDATE_ID], { account: voter.account }),
    ).rejects.toThrow(/InsufficientCandidates/);
  });

  it("casts one vote per wallet and exposes result reads", async () => {
    const { otherVoter, startAt, voter, voting } = await createElectionWithCandidates();

    await networkHelpers.time.increaseTo(startAt);

    await voting.write.vote([ELECTION_ID, CANDIDATE_ID], {
      account: voter.account,
    });

    await expect(
      voting.write.vote([ELECTION_ID, SECOND_CANDIDATE_ID], {
        account: voter.account,
      }),
    ).rejects.toThrow(/AlreadyVoted/);

    await voting.write.vote([ELECTION_ID, SECOND_CANDIDATE_ID], {
      account: otherVoter.account,
    });

    await expect(
      voting.read.hasVoted([ELECTION_ID, voter.account.address]),
    ).resolves.toBe(true);
    await expect(
      voting.read.getCandidateVotes([ELECTION_ID, CANDIDATE_ID]),
    ).resolves.toBe(BigInt(1));
    await expect(
      voting.read.getCandidateVotes([ELECTION_ID, SECOND_CANDIDATE_ID]),
    ).resolves.toBe(BigInt(1));
    await expect(voting.read.getElectionResult([ELECTION_ID])).resolves.toEqual([
      { candidateId: CANDIDATE_ID, votes: BigInt(1) },
      { candidateId: SECOND_CANDIDATE_ID, votes: BigInt(1) },
    ]);
  });

  it("rejects unknown candidates and votes after end", async () => {
    const { endAt, startAt, voter, voting } = await createElectionWithCandidates();

    await networkHelpers.time.increaseTo(startAt);
    await expect(
      voting.write.vote([ELECTION_ID, ZERO_BYTES32], { account: voter.account }),
    ).rejects.toThrow(/CandidateNotFound/);

    await networkHelpers.time.increaseTo(endAt);

    await expect(voting.read.getElectionStatus([ELECTION_ID])).resolves.toBe(3);
    await expect(
      voting.write.vote([ELECTION_ID, CANDIDATE_ID], { account: voter.account }),
    ).rejects.toThrow(/VotingNotActive/);
  });
});
