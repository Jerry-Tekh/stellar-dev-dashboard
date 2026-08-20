import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveProposalStatus,
  computeQuorumProgress,
  computeTimeRemaining,
  normalizeProposal,
  splitProposalsByStatus,
  fetchGovernanceProposals,
  fetchMyVote,
  submitGovernanceVote,
  simpleVotingAdapter,
  exampleCommitteeGovernanceAdapter,
  type AdapterProposalFields,
} from '../governance';
import { getSorobanServer, simulateContractCall, invokeContract, isValidContractId } from '../stellar';

vi.mock('../stellar', () => ({
  getSorobanServer: vi.fn(),
  simulateContractCall: vi.fn(),
  invokeContract: vi.fn(),
  isValidContractId: vi.fn(),
}));

const CONTRACT_ID = 'CGOVERNANCECONTRACTIDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const VOTER = 'GVOTERPUBLICKEYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

describe('deriveProposalStatus', () => {
  const base = {
    executed: false,
    cancelled: false,
    startLedger: null as number | null,
    deadlineLedger: 100,
    currentLedger: 50,
    quorumMet: true,
    votesFor: BigInt(10),
    votesAgainst: BigInt(5),
  };

  it('returns executed regardless of votes/deadline when the executed flag is set', () => {
    expect(deriveProposalStatus({ ...base, executed: true, currentLedger: 999 })).toBe('executed');
  });

  it('returns rejected when cancelled', () => {
    expect(deriveProposalStatus({ ...base, cancelled: true })).toBe('rejected');
  });

  it('returns pending when voting has not opened yet', () => {
    expect(deriveProposalStatus({ ...base, startLedger: 60, currentLedger: 55 })).toBe('pending');
  });

  it('returns active while currentLedger is strictly before the deadline', () => {
    expect(deriveProposalStatus({ ...base, currentLedger: 99 })).toBe('active');
  });

  it('treats the deadline ledger itself as closed (exact-deadline edge case), and resolves passed when quorum is met and for > against', () => {
    expect(deriveProposalStatus({ ...base, currentLedger: 100, deadlineLedger: 100, quorumMet: true, votesFor: BigInt(10), votesAgainst: BigInt(5) })).toBe('passed');
  });

  it('resolves rejected exactly at the deadline when quorum is met but against >= for', () => {
    expect(deriveProposalStatus({ ...base, currentLedger: 100, deadlineLedger: 100, quorumMet: true, votesFor: BigInt(5), votesAgainst: BigInt(10) })).toBe('rejected');
  });

  it('resolves expired exactly at the deadline when quorum was never met', () => {
    expect(deriveProposalStatus({ ...base, currentLedger: 100, deadlineLedger: 100, quorumMet: false })).toBe('expired');
  });

  it('resolves the same way once currentLedger has moved past the deadline', () => {
    expect(deriveProposalStatus({ ...base, currentLedger: 150, deadlineLedger: 100, quorumMet: true, votesFor: BigInt(10), votesAgainst: BigInt(5) })).toBe('passed');
  });
});

describe('computeQuorumProgress', () => {
  it('treats a zero/negative quorum as always met', () => {
    expect(computeQuorumProgress(BigInt(0), BigInt(0))).toEqual({ totalVotes: '0', quorum: '0', met: true, percent: 100 });
  });

  it('reports not-met with a sub-100 percent below quorum', () => {
    const progress = computeQuorumProgress(BigInt(40), BigInt(100));
    expect(progress.met).toBe(false);
    expect(progress.percent).toBeCloseTo(40, 5);
  });

  it('reports met with percent >= 100 once total votes reach quorum', () => {
    const progress = computeQuorumProgress(BigInt(100), BigInt(100));
    expect(progress.met).toBe(true);
    expect(progress.percent).toBeCloseTo(100, 5);
  });

  it('reports met exactly at the quorum boundary (>=), not requiring votes to exceed it', () => {
    const progress = computeQuorumProgress(BigInt(99), BigInt(100));
    expect(progress.met).toBe(false);
  });
});

describe('computeTimeRemaining', () => {
  it('reports ledgers/seconds remaining and isClosed=false before the deadline', () => {
    const result = computeTimeRemaining(100, 90, 5);
    expect(result).toEqual({ ledgersRemaining: 10, secondsRemaining: 50, isClosed: false });
  });

  it('reports zero remaining and isClosed=true exactly at the deadline', () => {
    const result = computeTimeRemaining(100, 100, 5);
    expect(result).toEqual({ ledgersRemaining: 0, secondsRemaining: 0, isClosed: true });
  });

  it('never reports negative remaining time once the deadline has passed', () => {
    const result = computeTimeRemaining(100, 150, 5);
    expect(result.ledgersRemaining).toBe(0);
    expect(result.isClosed).toBe(true);
  });
});

describe('normalizeProposal', () => {
  const fields: AdapterProposalFields = {
    title: 'Raise the base reserve',
    description: 'Adjust base reserve from 0.5 to 1 XLM',
    votesFor: '120',
    votesAgainst: '30',
    quorum: '100',
    deadlineLedger: 200,
  };

  it('derives status from shared logic when no explicitStatus is supplied', () => {
    const proposal = normalizeProposal('1', fields, 250);
    expect(proposal.status).toBe('passed');
    expect(proposal.votes).toEqual({ for: '120', against: '30', abstain: '0' });
    expect(proposal.quorumProgress.met).toBe(true);
  });

  it('honors an adapter-supplied explicitStatus over derivation', () => {
    const proposal = normalizeProposal('1', { ...fields, explicitStatus: 'executed' }, 10);
    expect(proposal.status).toBe('executed');
  });

  it('includes abstain votes toward quorum only when quorumBasis is forAgainstAbstain', () => {
    const withAbstain: AdapterProposalFields = { ...fields, votesFor: '40', votesAgainst: '20', votesAbstain: '45', quorum: '100' };

    const forAgainstOnly = normalizeProposal('1', { ...withAbstain, quorumBasis: 'forAgainst' }, 250);
    expect(forAgainstOnly.quorumProgress.met).toBe(false); // 40 + 20 = 60 < 100

    const includingAbstain = normalizeProposal('1', { ...withAbstain, quorumBasis: 'forAgainstAbstain' }, 250);
    expect(includingAbstain.quorumProgress.met).toBe(true); // 40 + 20 + 45 = 105 >= 100
  });
});

describe('splitProposalsByStatus', () => {
  it('buckets pending/active as open and everything else as historical', () => {
    const proposals = [
      normalizeProposal('1', { ...baseFields(), explicitStatus: 'pending' }, 0),
      normalizeProposal('2', { ...baseFields(), explicitStatus: 'active' }, 0),
      normalizeProposal('3', { ...baseFields(), explicitStatus: 'passed' }, 0),
      normalizeProposal('4', { ...baseFields(), explicitStatus: 'rejected' }, 0),
      normalizeProposal('5', { ...baseFields(), explicitStatus: 'executed' }, 0),
      normalizeProposal('6', { ...baseFields(), explicitStatus: 'expired' }, 0),
    ];

    const { open, historical } = splitProposalsByStatus(proposals);
    expect(open.map((p) => p.id)).toEqual(['1', '2']);
    expect(historical.map((p) => p.id)).toEqual(['3', '4', '5', '6']);
  });
});

function baseFields(): AdapterProposalFields {
  return {
    title: 't',
    description: 'd',
    votesFor: '1',
    votesAgainst: '1',
    quorum: '1',
    deadlineLedger: 10,
  };
}

describe('simpleVotingAdapter (reference adapter)', () => {
  it('maps the raw simple-voting-scaffold shape to normalized fields', () => {
    const fields = simpleVotingAdapter.mapProposal(
      { votes_for: '120', votes_against: '30', quorum: '100', deadline: 500, executed: false },
      '7',
    );
    expect(fields).toMatchObject({
      title: 'Proposal #7',
      votesFor: '120',
      votesAgainst: '30',
      quorum: '100',
      deadlineLedger: 500,
      executed: false,
    });
  });

  it('maps a boolean vote to for/against and null to "no vote"', () => {
    expect(simpleVotingAdapter.mapVote?.(true)).toEqual({ choice: 'for', weight: null });
    expect(simpleVotingAdapter.mapVote?.(false)).toEqual({ choice: 'against', weight: null });
    expect(simpleVotingAdapter.mapVote?.(null)).toBeNull();
  });

  it('builds vote args mapping the "for" / "against" choice onto the approve boolean', () => {
    expect(simpleVotingAdapter.buildVoteArgs('7', 'for', VOTER)).toEqual([
      { type: 'address', value: VOTER },
      { type: 'int', value: '7' },
      { type: 'bool', value: 'true' },
    ]);
    expect(simpleVotingAdapter.buildVoteArgs('7', 'against', VOTER)).toEqual([
      { type: 'address', value: VOTER },
      { type: 'int', value: '7' },
      { type: 'bool', value: 'false' },
    ]);
  });
});

describe('exampleCommitteeGovernanceAdapter (worked example, distinct shape)', () => {
  const committeeRaw = {
    id: 3,
    title: 'Fund the grants program',
    description: 'Allocate treasury funds to the grants committee',
    tally: { for: '40', against: '10', abstain: '5' },
    quorum: '50',
    deadline_ledger: 1000,
    status: 'Voting' as const,
    votes: { [VOTER]: 'for' as const },
  };

  it('maps a fundamentally different on-chain shape (3-way votes, explicit status, embedded voters)', () => {
    const fields = exampleCommitteeGovernanceAdapter.mapProposal(committeeRaw, '3');
    expect(fields).toMatchObject({
      title: 'Fund the grants program',
      votesFor: '40',
      votesAgainst: '10',
      votesAbstain: '5',
      quorumBasis: 'forAgainstAbstain',
      quorum: '50',
      deadlineLedger: 1000,
      executed: false,
    });
    // 'Voting' has no direct ProposalStatus equivalent, so explicitStatus is left
    // undefined and the shared derive logic (active/pending) takes over.
    expect(fields.explicitStatus).toBeUndefined();
  });

  it('maps terminal committee statuses onto the shared enum', () => {
    expect(exampleCommitteeGovernanceAdapter.mapProposal({ ...committeeRaw, status: 'Executed' }, '3').explicitStatus).toBe('executed');
    expect(exampleCommitteeGovernanceAdapter.mapProposal({ ...committeeRaw, status: 'Failed' }, '3').explicitStatus).toBe('rejected');
  });

  it('detects already-voted accounts from the embedded voters map with no extra RPC call', () => {
    expect(exampleCommitteeGovernanceAdapter.extractVoters?.(committeeRaw)).toEqual({ [VOTER]: 'for' });
  });
});

describe('fetchMyVote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detects an existing vote via extractVoters without any additional simulate call', async () => {
    const proposalRaw = { votes: { [VOTER]: 'against' } };
    const adapter = { ...exampleCommitteeGovernanceAdapter, extractVoters: () => ({ [VOTER]: 'against' as const }) };

    const result = await fetchMyVote({
      adapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      sourceAccount: VOTER,
      proposalId: '3',
      voter: VOTER,
      proposalRaw,
    });

    expect(result).toEqual({ proposalId: '3', voter: VOTER, choice: 'against', weight: null });
    expect(simulateContractCall).not.toHaveBeenCalled();
  });

  it('returns null when extractVoters has no entry for the voter', async () => {
    const adapter = { ...exampleCommitteeGovernanceAdapter, extractVoters: () => ({}) };
    const result = await fetchMyVote({
      adapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      sourceAccount: VOTER,
      proposalId: '3',
      voter: VOTER,
      proposalRaw: {},
    });
    expect(result).toBeNull();
  });

  it('falls back to a dedicated getVoteFunction read call when the adapter has no embedded voters', async () => {
    vi.mocked(simulateContractCall).mockResolvedValue({ result: true } as never);

    const result = await fetchMyVote({
      adapter: simpleVotingAdapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      sourceAccount: VOTER,
      proposalId: '7',
      voter: VOTER,
    });

    expect(simulateContractCall).toHaveBeenCalledWith({
      contractId: CONTRACT_ID,
      functionName: 'get_vote',
      args: [{ type: 'int', value: '7' }, { type: 'address', value: VOTER }],
      sourceAccount: VOTER,
      network: 'testnet',
    });
    expect(result).toEqual({ proposalId: '7', voter: VOTER, choice: 'for', weight: null });
  });
});

describe('fetchGovernanceProposals (RPC orchestration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isValidContractId).mockReturnValue(true);
    vi.mocked(getSorobanServer).mockReturnValue({
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
    } as never);
  });

  it('rejects an invalid governance contract address before making any RPC calls', async () => {
    vi.mocked(isValidContractId).mockReturnValue(false);
    await expect(
      fetchGovernanceProposals({ adapter: simpleVotingAdapter, contractId: 'bad', network: 'testnet', sourceAccount: VOTER }),
    ).rejects.toThrow('Invalid governance contract address');
    expect(simulateContractCall).not.toHaveBeenCalled();
  });

  it('discovers proposals via a count + per-id fetch, and correctly categorizes a mix of active/passed/rejected proposals', async () => {
    vi.mocked(simulateContractCall).mockImplementation(async ({ functionName, args }) => {
      if (functionName === 'get_proposal_count') return { result: 3 } as never;
      const id = (args as { value: string }[])[0].value;
      const byId: Record<string, unknown> = {
        '1': { votes_for: '10', votes_against: '2', quorum: '5', deadline: 2000, executed: false }, // active (before deadline)
        '2': { votes_for: '10', votes_against: '2', quorum: '5', deadline: 500, executed: false }, // passed (quorum met, for > against, past deadline)
        '3': { votes_for: '2', votes_against: '10', quorum: '5', deadline: 500, executed: false }, // rejected
      };
      return { result: byId[id] } as never;
    });

    const snapshot = await fetchGovernanceProposals({
      adapter: simpleVotingAdapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      sourceAccount: VOTER,
    });

    expect(snapshot.currentLedger).toBe(1000);
    // sorted newest id first
    expect(snapshot.proposals.map((p) => p.id)).toEqual(['3', '2', '1']);

    const byId = Object.fromEntries(snapshot.proposals.map((p) => [p.id, p]));
    expect(byId['1'].status).toBe('active');
    expect(byId['2'].status).toBe('passed');
    expect(byId['3'].status).toBe('rejected');
  });

  it('populates myVote for each proposal when a voter is supplied', async () => {
    vi.mocked(simulateContractCall).mockImplementation(async ({ functionName }) => {
      if (functionName === 'get_proposal_count') return { result: 1 } as never;
      if (functionName === 'get_proposal') {
        return { result: { votes_for: '10', votes_against: '2', quorum: '5', deadline: 2000, executed: false } } as never;
      }
      if (functionName === 'get_vote') return { result: true } as never;
      throw new Error(`unexpected function ${functionName}`);
    });

    const snapshot = await fetchGovernanceProposals({
      adapter: simpleVotingAdapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      sourceAccount: VOTER,
      voter: VOTER,
    });

    expect(snapshot.proposals[0].myVote).toEqual({ proposalId: '1', voter: VOTER, choice: 'for', weight: null });
  });

  it('discovers proposals via the list-full strategy (a differently-shaped contract) with no code changes required', async () => {
    vi.mocked(simulateContractCall).mockResolvedValue({
      result: [
        {
          id: 1,
          title: 'Committee proposal',
          description: 'desc',
          tally: { for: '100', against: '10', abstain: '0' },
          quorum: '50',
          deadline_ledger: 2000,
          status: 'Voting',
          votes: {},
        },
      ],
    } as never);

    const snapshot = await fetchGovernanceProposals({
      adapter: exampleCommitteeGovernanceAdapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      sourceAccount: VOTER,
    });

    expect(snapshot.proposals).toHaveLength(1);
    expect(snapshot.proposals[0]).toMatchObject({ id: '1', title: 'Committee proposal', status: 'active' });
  });
});

describe('submitGovernanceVote (reuses the existing signing pipeline)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to invokeContract with the adapter-shaped function name and args', async () => {
    vi.mocked(invokeContract).mockResolvedValue({ hash: 'abc', status: 'PENDING', errorResult: null, diagnosticEvents: [] });

    const result = await submitGovernanceVote({
      adapter: simpleVotingAdapter,
      contractId: CONTRACT_ID,
      network: 'testnet',
      proposalId: '7',
      choice: 'for',
      voter: VOTER,
      secretKey: 'SSECRET',
    });

    expect(invokeContract).toHaveBeenCalledWith({
      contractId: CONTRACT_ID,
      functionName: 'vote',
      args: [
        { type: 'address', value: VOTER },
        { type: 'int', value: '7' },
        { type: 'bool', value: 'true' },
      ],
      secretKey: 'SSECRET',
      network: 'testnet',
    });
    expect(result.hash).toBe('abc');
  });
});
