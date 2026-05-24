// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract SepoliaVoting {
    enum ElectionStatus {
        NotCreated,
        Pending,
        Active,
        Ended
    }

    struct ElectionConfig {
        address adminAddress;
        uint64 startAt;
        uint64 endAt;
        uint256 candidateCount;
    }

    struct CandidateResult {
        bytes32 candidateId;
        uint256 votes;
    }

    struct Election {
        address adminAddress;
        uint64 startAt;
        uint64 endAt;
        bytes32[] candidateIds;
        bool exists;
    }

    struct Candidate {
        bytes32 metadataHash;
        uint256 votes;
        bool exists;
    }

    error InvalidElectionId();
    error InvalidCandidateId();
    error InvalidMetadataHash();
    error InvalidAdminAddress();
    error InvalidTimeRange();
    error ElectionAlreadyExists();
    error ElectionNotFound();
    error NotElectionCreator();
    error CandidateAlreadyExists();
    error CandidateNotFound();
    error NotElectionAdmin();
    error CandidateRegistrationClosed();
    error VotingNotActive();
    error InsufficientCandidates();
    error AlreadyVoted();

    event ElectionCreated(
        bytes32 indexed electionId,
        address indexed adminAddress,
        uint64 startAt,
        uint64 endAt
    );
    event CandidateRegistered(
        bytes32 indexed electionId,
        bytes32 indexed candidateId,
        bytes32 metadataHash
    );
    event VoteCast(
        bytes32 indexed electionId,
        bytes32 indexed candidateId,
        address indexed voterAddress,
        uint64 timestamp
    );

    mapping(bytes32 electionId => Election election) private elections;
    mapping(bytes32 electionId => mapping(bytes32 candidateId => Candidate candidate))
        private candidates;
    mapping(bytes32 electionId => mapping(address voterAddress => bool voted))
        private votedByWallet;

    function createElection(
        bytes32 electionId,
        uint64 startAt,
        uint64 endAt,
        address adminAddress
    ) external {
        if (electionId == bytes32(0)) {
            revert InvalidElectionId();
        }
        if (adminAddress == address(0)) {
            revert InvalidAdminAddress();
        }
        if (startAt < block.timestamp || endAt <= startAt) {
            revert InvalidTimeRange();
        }
        if (msg.sender != adminAddress) {
            revert NotElectionCreator();
        }
        if (elections[electionId].exists) {
            revert ElectionAlreadyExists();
        }

        Election storage election = elections[electionId];
        election.adminAddress = adminAddress;
        election.startAt = startAt;
        election.endAt = endAt;
        election.exists = true;

        emit ElectionCreated(electionId, adminAddress, startAt, endAt);
    }

    function registerCandidate(
        bytes32 electionId,
        bytes32 candidateId,
        bytes32 metadataHash
    ) external {
        Election storage election = requireElection(electionId);

        if (msg.sender != election.adminAddress) {
            revert NotElectionAdmin();
        }
        if (block.timestamp >= election.startAt) {
            revert CandidateRegistrationClosed();
        }
        if (candidateId == bytes32(0)) {
            revert InvalidCandidateId();
        }
        if (metadataHash == bytes32(0)) {
            revert InvalidMetadataHash();
        }
        if (candidates[electionId][candidateId].exists) {
            revert CandidateAlreadyExists();
        }

        candidates[electionId][candidateId] = Candidate({
            metadataHash: metadataHash,
            votes: 0,
            exists: true
        });
        election.candidateIds.push(candidateId);

        emit CandidateRegistered(electionId, candidateId, metadataHash);
    }

    function vote(bytes32 electionId, bytes32 candidateId) external {
        Election storage election = requireElection(electionId);
        Candidate storage candidate = requireCandidate(electionId, candidateId);
        ElectionStatus status = getElectionStatus(electionId);

        if (status != ElectionStatus.Active) {
            revert VotingNotActive();
        }
        if (election.candidateIds.length < 2) {
            revert InsufficientCandidates();
        }
        if (votedByWallet[electionId][msg.sender]) {
            revert AlreadyVoted();
        }

        votedByWallet[electionId][msg.sender] = true;
        candidate.votes += 1;

        emit VoteCast(electionId, candidateId, msg.sender, uint64(block.timestamp));
    }

    function getElection(bytes32 electionId) external view returns (ElectionConfig memory) {
        Election storage election = requireElection(electionId);

        return
            ElectionConfig({
                adminAddress: election.adminAddress,
                startAt: election.startAt,
                endAt: election.endAt,
                candidateCount: election.candidateIds.length
            });
    }

    function hasVoted(
        bytes32 electionId,
        address voterAddress
    ) external view returns (bool) {
        requireElection(electionId);

        return votedByWallet[electionId][voterAddress];
    }

    function getCandidateVotes(
        bytes32 electionId,
        bytes32 candidateId
    ) external view returns (uint256) {
        Candidate storage candidate = requireCandidate(electionId, candidateId);

        return candidate.votes;
    }

    function getElectionResult(
        bytes32 electionId
    ) external view returns (CandidateResult[] memory) {
        Election storage election = requireElection(electionId);
        CandidateResult[] memory results = new CandidateResult[](
            election.candidateIds.length
        );

        for (uint256 index = 0; index < election.candidateIds.length; index++) {
            bytes32 candidateId = election.candidateIds[index];
            results[index] = CandidateResult({
                candidateId: candidateId,
                votes: candidates[electionId][candidateId].votes
            });
        }

        return results;
    }

    function getElectionStatus(bytes32 electionId) public view returns (ElectionStatus) {
        Election storage election = elections[electionId];

        if (!election.exists) {
            return ElectionStatus.NotCreated;
        }
        if (block.timestamp < election.startAt) {
            return ElectionStatus.Pending;
        }
        if (block.timestamp < election.endAt) {
            return ElectionStatus.Active;
        }

        return ElectionStatus.Ended;
    }

    function getCandidates(bytes32 electionId) external view returns (bytes32[] memory) {
        Election storage election = requireElection(electionId);

        return election.candidateIds;
    }

    function requireElection(
        bytes32 electionId
    ) private view returns (Election storage election) {
        election = elections[electionId];

        if (!election.exists) {
            revert ElectionNotFound();
        }
    }

    function requireCandidate(
        bytes32 electionId,
        bytes32 candidateId
    ) private view returns (Candidate storage candidate) {
        requireElection(electionId);
        candidate = candidates[electionId][candidateId];

        if (!candidate.exists) {
            revert CandidateNotFound();
        }
    }
}
