/**
 * Governance Contract Adapter Framework
 * ─────────────────────────────────────────────────────────────────────────────
 * Soroban governance ("proposal and voting") contracts don't share one
 * universal on-chain shape yet — some expose a monotonic proposal counter with
 * a `get_proposal(id)` accessor, others return every proposal from a single
 * call, some track a boolean for/against vote, others track weighted
 * for/against/abstain tallies with an explicit status enum.
 *
 * This module keeps the parts that *are* universal (quorum math, status
 * derivation from votes/deadline, time-remaining math, "did this account
 * already vote" detection, and the read/write RPC orchestration via
 * `simulateContractCall` / `invokeContract` from `./stellar`) in one place,
 * and asks each contract shape to supply a small `GovernanceAdapter` that maps
 * its own read-function names and return shapes onto a normalized
 * `NormalizedProposal`. The dashboard tab (`Governance.tsx`) only ever works
 * with `NormalizedProposal` / `NormalizedVoteRecord` — it never needs to know
 * which adapter produced them.
 *
 * ─── Adapter interface, worked example ──────────────────────────────────────
 * Say a contract exposes proposals in a totally different shape than the
 * shipped `simpleVotingAdapter` (see below): a single `list_proposals()` call
 * returns every proposal as a full struct (no per-id fetch), voting has three
 * buckets (for/against/abstain), the contract already tracks an explicit
 * status enum, and "who voted" is embedded as a map on the proposal itself
 * rather than requiring a separate read call. That contract can be supported
 * with zero changes to Governance.tsx by writing an adapter like:
 *
 * ```ts
 * const committeeAdapter: GovernanceAdapter = {
 *   id: 'committee-v1',
 *   displayName: 'Committee Governance (list-full shape)',
 *   discovery: {
 *     kind: 'list-full',
 *     listFunction: 'list_proposals',
 *     extractProposalId: (raw) => String((raw as { id: unknown }).id),
 *   },
 *   mapProposal: (raw) => {
 *     const p = raw as CommitteeProposalRaw;
 *     return {
 *       title: p.title,
 *       description: p.description,
 *       votesFor: p.tally.for,
 *       votesAgainst: p.tally.against,
 *       votesAbstain: p.tally.abstain,
 *       quorumBasis: 'forAgainstAbstain',
 *       quorum: p.quorum,
 *       deadlineLedger: p.deadline_ledger,
 *       executed: p.status === 'Executed',
 *       explicitStatus: mapCommitteeStatus(p.status),
 *     };
 *   },
 *   extractVoters: (raw) => (raw as CommitteeProposalRaw).votes,
 *   voteFunction: 'cast_vote',
 *   buildVoteArgs: (proposalId, choice, voter) => [
 *     { type: 'int', value: proposalId },
 *     { type: 'address', value: voter },
 *     { type: 'string', value: choice },
 *   ],
 * };
 * ```
 *
 * This is exactly `exampleCommitteeGovernanceAdapter` below, kept as a real,
 * tested export rather than only a comment.
 */

import {
  getSorobanServer,
  simulateContractCall,
  invokeContract,
  isValidContractId,
  type ContractInvocationArg,
  type ContractSubmitResult,
  type NetworkName,
} from './stellar';

// ─── Shared types ───────────────────────────────────────────────────────────

export type ProposalStatus =
  | 'pending'
  | 'active'
  | 'passed'
  | 'rejected'
  | 'executed'
  | 'expired';

export type VoteChoice = 'for' | 'against' | 'abstain';

/** Stellar closes a ledger roughly every 5 seconds; used for time-remaining estimates. */
export const AVERAGE_LEDGER_CLOSE_SECONDS = 5;

type NumericLike = string | number | bigint;

export interface NormalizedVoteTally {
  for: string;
  against: string;
  abstain: string;
}

export interface QuorumProgress {
  totalVotes: string;
  quorum: string;
  met: boolean;
  /** 0-100+ (uncapped past 100 so an over-quorum proposal is still legible). */
  percent: number;
}

export interface TimeRemaining {
  ledgersRemaining: number;
  secondsRemaining: number;
  isClosed: boolean;
}

export interface NormalizedVoteRecord {
  proposalId: string;
  voter: string;
  choice: VoteChoice;
  weight: string | null;
}

export interface NormalizedProposal {
  id: string;
  title: string;
  description: string;
  metadataUri: string | null;
  proposer: string | null;
  status: ProposalStatus;
  votes: NormalizedVoteTally;
  quorumProgress: QuorumProgress;
  deadlineLedger: number;
  startLedger: number | null;
  timeRemaining: TimeRemaining;
  executed: boolean;
  cancelled: boolean;
  /** Populated when a voter address is supplied to fetchGovernanceProposals; undefined = not checked. */
  myVote?: NormalizedVoteRecord | null;
  raw: unknown;
}

// ─── Adapter-supplied proposal fields (pre-normalization) ──────────────────

export interface AdapterProposalFields {
  title: string;
  description: string;
  metadataUri?: string | null;
  proposer?: string | null;
  votesFor: NumericLike;
  votesAgainst: NumericLike;
  votesAbstain?: NumericLike;
  quorum: NumericLike;
  /** Which buckets count toward quorum. Defaults to 'forAgainst'. */
  quorumBasis?: 'forAgainst' | 'forAgainstAbstain';
  deadlineLedger: number;
  /** Ledger the voting window opens; omit if voting is open as soon as the proposal exists. */
  startLedger?: number | null;
  executed?: boolean;
  cancelled?: boolean;
  /** If the contract already exposes a status/state enum, return it here to skip derivation entirely. */
  explicitStatus?: ProposalStatus;
}

// ─── Proposal discovery strategies ─────────────────────────────────────────

export type ProposalDiscovery =
  | {
      /** Contract exposes a count/counter; ids are fetched one-by-one. */
      kind: 'count';
      countFunction: string;
      countArgs?: ContractInvocationArg[];
      /** First valid proposal id. Defaults to 1 (the common "counter starts at 1" convention). */
      startAt?: 0 | 1;
      getProposalFunction: string;
      buildGetProposalArgs: (proposalId: string) => ContractInvocationArg[];
    }
  | {
      /** Contract returns a list of raw ids; each proposal is then fetched individually. */
      kind: 'list-ids';
      listFunction: string;
      listArgs?: ContractInvocationArg[];
      getProposalFunction: string;
      buildGetProposalArgs: (proposalId: string) => ContractInvocationArg[];
    }
  | {
      /** Contract returns every proposal as a full struct in a single call. */
      kind: 'list-full';
      listFunction: string;
      listArgs?: ContractInvocationArg[];
      extractProposalId: (raw: unknown) => string;
    };

// ─── The adapter interface ──────────────────────────────────────────────────

export interface GovernanceAdapter<TProposalRaw = unknown, TVoteRaw = unknown> {
  id: string;
  displayName: string;

  discovery: ProposalDiscovery;

  /** Pure mapping from one raw (already scVal-decoded) proposal to normalized fields. */
  mapProposal(raw: TProposalRaw, proposalId: string): AdapterProposalFields;

  /** Option A for "already voted" detection: a dedicated read call. */
  getVoteFunction?: string;
  buildGetVoteArgs?: (proposalId: string, voter: string) => ContractInvocationArg[];
  mapVote?: (raw: TVoteRaw) => Pick<NormalizedVoteRecord, 'choice' | 'weight'> | null;

  /** Option B: the proposal struct itself embeds a voter -> choice map. */
  extractVoters?: (raw: TProposalRaw) => Record<string, VoteChoice> | null | undefined;

  /** Whether this contract accepts an 'abstain' vote. Defaults to false (for/against only). */
  supportsAbstain?: boolean;

  /** Vote submission — reuses stellar.ts's existing build/sign/submit pipeline. */
  voteFunction: string;
  buildVoteArgs: (proposalId: string, choice: VoteChoice, voter: string) => ContractInvocationArg[];
}

// ─── Numeric helpers ────────────────────────────────────────────────────────

function toBigInt(value: NumericLike): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot convert non-finite number to bigint');
    return BigInt(Math.trunc(value));
  }
  const trimmed = value.trim();
  if (trimmed === '') return BigInt(0);
  return BigInt(trimmed);
}

// ─── Pure derivation logic (the part every adapter shares) ─────────────────

export interface StatusDerivationInput {
  executed: boolean;
  cancelled: boolean;
  startLedger: number | null;
  deadlineLedger: number;
  currentLedger: number;
  quorumMet: boolean;
  votesFor: bigint;
  votesAgainst: bigint;
}

/**
 * Derives a proposal's lifecycle status from raw vote/quorum/deadline facts.
 * Terminal on-chain flags (executed/cancelled) always win. Otherwise:
 *  - `pending`  — voting hasn't opened yet (currentLedger < startLedger)
 *  - `active`   — currentLedger < deadlineLedger (the deadline ledger itself
 *                 counts as closed, not open — voting ends *at* the deadline)
 *  - `expired`  — voting closed but quorum was never reached
 *  - `passed`   — quorum reached and votesFor > votesAgainst
 *  - `rejected` — quorum reached but votesFor <= votesAgainst, or cancelled
 */
export function deriveProposalStatus(input: StatusDerivationInput): ProposalStatus {
  const { executed, cancelled, startLedger, deadlineLedger, currentLedger, quorumMet, votesFor, votesAgainst } = input;

  if (executed) return 'executed';
  if (cancelled) return 'rejected';
  if (startLedger != null && currentLedger < startLedger) return 'pending';

  const votingOpen = currentLedger < deadlineLedger;
  if (votingOpen) return 'active';

  if (!quorumMet) return 'expired';
  return votesFor > votesAgainst ? 'passed' : 'rejected';
}

export function computeQuorumProgress(totalVotes: bigint, quorum: bigint): QuorumProgress {
  const met = quorum <= BigInt(0) ? true : totalVotes >= quorum;
  const percent = quorum <= BigInt(0)
    ? 100
    : Number((totalVotes * BigInt(10000)) / quorum) / 100;

  return {
    totalVotes: totalVotes.toString(),
    quorum: quorum.toString(),
    met,
    percent: Math.max(0, percent),
  };
}

export function computeTimeRemaining(
  deadlineLedger: number,
  currentLedger: number,
  avgLedgerSeconds: number = AVERAGE_LEDGER_CLOSE_SECONDS,
): TimeRemaining {
  const ledgersRemaining = Math.max(0, deadlineLedger - currentLedger);
  return {
    ledgersRemaining,
    secondsRemaining: ledgersRemaining * avgLedgerSeconds,
    isClosed: currentLedger >= deadlineLedger,
  };
}

/** Turns adapter-supplied fields + the current ledger into a fully normalized proposal. */
export function normalizeProposal(
  proposalId: string,
  fields: AdapterProposalFields,
  currentLedger: number,
  raw: unknown = null,
): NormalizedProposal {
  const votesFor = toBigInt(fields.votesFor);
  const votesAgainst = toBigInt(fields.votesAgainst);
  const votesAbstain = toBigInt(fields.votesAbstain ?? 0);
  const quorum = toBigInt(fields.quorum);
  const basis = fields.quorumBasis ?? 'forAgainst';
  const totalForQuorum = basis === 'forAgainstAbstain'
    ? votesFor + votesAgainst + votesAbstain
    : votesFor + votesAgainst;

  const quorumProgress = computeQuorumProgress(totalForQuorum, quorum);
  const executed = fields.executed ?? false;
  const cancelled = fields.cancelled ?? false;
  const startLedger = fields.startLedger ?? null;

  const status = fields.explicitStatus ?? deriveProposalStatus({
    executed,
    cancelled,
    startLedger,
    deadlineLedger: fields.deadlineLedger,
    currentLedger,
    quorumMet: quorumProgress.met,
    votesFor,
    votesAgainst,
  });

  return {
    id: proposalId,
    title: fields.title,
    description: fields.description,
    metadataUri: fields.metadataUri ?? null,
    proposer: fields.proposer ?? null,
    status,
    votes: {
      for: votesFor.toString(),
      against: votesAgainst.toString(),
      abstain: votesAbstain.toString(),
    },
    quorumProgress,
    deadlineLedger: fields.deadlineLedger,
    startLedger,
    timeRemaining: computeTimeRemaining(fields.deadlineLedger, currentLedger),
    executed,
    cancelled,
    raw,
  };
}

export function splitProposalsByStatus(proposals: NormalizedProposal[]): {
  open: NormalizedProposal[];
  historical: NormalizedProposal[];
} {
  const open: NormalizedProposal[] = [];
  const historical: NormalizedProposal[] = [];

  for (const proposal of proposals) {
    if (proposal.status === 'pending' || proposal.status === 'active') {
      open.push(proposal);
    } else {
      historical.push(proposal);
    }
  }

  return { open, historical };
}

function compareProposalIdsDesc(a: NormalizedProposal, b: NormalizedProposal): number {
  const numericA = Number(a.id);
  const numericB = Number(b.id);
  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericB - numericA;
  }
  return b.id.localeCompare(a.id);
}

// ─── RPC orchestration ──────────────────────────────────────────────────────

interface GovernanceReadContext {
  contractId: string;
  network: NetworkName;
  sourceAccount: string;
}

async function discoverProposals(
  adapter: GovernanceAdapter,
  ctx: GovernanceReadContext,
): Promise<{ id: string; raw: unknown }[]> {
  const { contractId, network, sourceAccount } = ctx;
  const { discovery } = adapter;

  if (discovery.kind === 'count') {
    const countResult = await simulateContractCall({
      contractId,
      functionName: discovery.countFunction,
      args: discovery.countArgs,
      sourceAccount,
      network,
    });
    const count = Number(toBigInt(countResult.result as NumericLike));
    const startAt = discovery.startAt ?? 1;
    const ids = Array.from({ length: count }, (_, i) => String(startAt + i));

    return Promise.all(ids.map(async (id) => {
      const result = await simulateContractCall({
        contractId,
        functionName: discovery.getProposalFunction,
        args: discovery.buildGetProposalArgs(id),
        sourceAccount,
        network,
      });
      return { id, raw: result.result };
    }));
  }

  if (discovery.kind === 'list-ids') {
    const listResult = await simulateContractCall({
      contractId,
      functionName: discovery.listFunction,
      args: discovery.listArgs,
      sourceAccount,
      network,
    });
    const ids = (listResult.result as NumericLike[]).map((value) => toBigInt(value).toString());

    return Promise.all(ids.map(async (id) => {
      const result = await simulateContractCall({
        contractId,
        functionName: discovery.getProposalFunction,
        args: discovery.buildGetProposalArgs(id),
        sourceAccount,
        network,
      });
      return { id, raw: result.result };
    }));
  }

  // kind === 'list-full'
  const listResult = await simulateContractCall({
    contractId,
    functionName: discovery.listFunction,
    args: discovery.listArgs,
    sourceAccount,
    network,
  });
  const rows = (listResult.result as unknown[]) ?? [];
  return rows.map((raw) => ({ id: discovery.extractProposalId(raw), raw }));
}

/**
 * Looks up whether `voter` has already voted on a proposal, either via the
 * adapter's dedicated read call or via voter data embedded on the proposal
 * struct itself (whichever the adapter supports).
 */
export async function fetchMyVote(params: {
  adapter: GovernanceAdapter;
  contractId: string;
  network: NetworkName;
  sourceAccount: string;
  proposalId: string;
  voter: string;
  proposalRaw?: unknown;
}): Promise<NormalizedVoteRecord | null> {
  const { adapter, contractId, network, sourceAccount, proposalId, voter, proposalRaw } = params;

  if (adapter.extractVoters && proposalRaw !== undefined) {
    const voters = adapter.extractVoters(proposalRaw);
    const choice = voters?.[voter];
    return choice ? { proposalId, voter, choice, weight: null } : null;
  }

  if (adapter.getVoteFunction && adapter.buildGetVoteArgs && adapter.mapVote) {
    const result = await simulateContractCall({
      contractId,
      functionName: adapter.getVoteFunction,
      args: adapter.buildGetVoteArgs(proposalId, voter),
      sourceAccount,
      network,
    });
    const mapped = adapter.mapVote(result.result);
    if (!mapped) return null;
    return { proposalId, voter, choice: mapped.choice, weight: mapped.weight };
  }

  return null;
}

export interface FetchGovernanceProposalsParams {
  adapter: GovernanceAdapter;
  contractId: string;
  network: NetworkName;
  sourceAccount: string;
  /** When supplied, each proposal's myVote field is populated. */
  voter?: string | null;
}

export interface GovernanceSnapshot {
  currentLedger: number;
  proposals: NormalizedProposal[];
}

/** Fetches, maps, and normalizes every proposal known to a governance contract. */
export async function fetchGovernanceProposals(
  params: FetchGovernanceProposalsParams,
): Promise<GovernanceSnapshot> {
  const { adapter, contractId, network, sourceAccount, voter } = params;

  if (!isValidContractId(contractId)) {
    throw new Error('Invalid governance contract address');
  }

  const server = getSorobanServer(network);
  const latest = await server.getLatestLedger();
  const currentLedger = latest.sequence;

  const entries = await discoverProposals(adapter, { contractId, network, sourceAccount });

  const proposals = await Promise.all(entries.map(async ({ id, raw }) => {
    const fields = adapter.mapProposal(raw, id);
    const proposal = normalizeProposal(id, fields, currentLedger, raw);

    if (voter) {
      proposal.myVote = await fetchMyVote({
        adapter,
        contractId,
        network,
        sourceAccount,
        proposalId: id,
        voter,
        proposalRaw: raw,
      });
    }

    return proposal;
  }));

  proposals.sort(compareProposalIdsDesc);

  return { currentLedger, proposals };
}

// ─── Vote submission (reuses the existing build/sign/submit pipeline) ──────

export interface SubmitGovernanceVoteParams {
  adapter: GovernanceAdapter;
  contractId: string;
  network: NetworkName;
  proposalId: string;
  choice: VoteChoice;
  voter: string;
  secretKey: string;
}

/**
 * Submits a vote. Deliberately thin: it just shapes the adapter's function
 * name/args and hands off to `invokeContract` in stellar.ts, the same
 * simulate → prepare → sign → send pipeline every other contract-writing tab
 * in this dashboard uses (see ContractInteraction.tsx). No parallel signing
 * or submission path is introduced here.
 */
export async function submitGovernanceVote(
  params: SubmitGovernanceVoteParams,
): Promise<ContractSubmitResult> {
  const { adapter, contractId, network, proposalId, choice, voter, secretKey } = params;

  return invokeContract({
    contractId,
    functionName: adapter.voteFunction,
    args: adapter.buildVoteArgs(proposalId, choice, voter),
    secretKey,
    network,
  });
}

// ─── Off-chain proposal metadata (optional) ────────────────────────────────

export interface ProposalMetadata {
  title?: string;
  description?: string;
}

/**
 * Best-effort fetch of a proposal's off-chain metadata document (e.g. an
 * IPFS/HTTPS JSON blob referenced by `metadataUri`), for adapters whose
 * contract only stores a hash/URI on-chain rather than the full text.
 * Returns null on any failure so callers can silently fall back to the
 * on-chain title/description.
 */
export async function fetchProposalMetadata(uri: string): Promise<ProposalMetadata | null> {
  if (!uri) return null;
  try {
    const response = await fetch(uri);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: typeof data?.title === 'string' ? data.title : undefined,
      description: typeof data?.description === 'string' ? data.description : undefined,
    };
  } catch {
    return null;
  }
}

// ─── Reference adapter: "id, votes-for, votes-against, quorum, deadline" ───

/**
 * Matches the common simple-voting scaffold shape:
 *   get_proposal_count() -> u32
 *   get_proposal(id: u32) -> { votes_for: i128, votes_against: i128,
 *                              quorum: i128, deadline: u32, executed: bool }
 *   get_vote(id: u32, voter: address) -> Option<bool>   (true = for, false = against)
 *   vote(voter: address, id: u32, approve: bool)
 *
 * These scaffolds typically don't store a title/description on-chain, so the
 * reference adapter falls back to a generic "Proposal #<id>" label — projects
 * with richer metadata can supply their own adapter (see
 * `exampleCommitteeGovernanceAdapter`) or layer `fetchProposalMetadata` on top.
 */
interface SimpleVotingProposalRaw {
  votes_for: NumericLike;
  votes_against: NumericLike;
  quorum: NumericLike;
  deadline: number;
  executed?: boolean;
}

export const simpleVotingAdapter: GovernanceAdapter<SimpleVotingProposalRaw, boolean | null> = {
  id: 'simple-voting-v1',
  displayName: 'Simple Voting Scaffold (id / for / against / quorum / deadline)',
  discovery: {
    kind: 'count',
    countFunction: 'get_proposal_count',
    startAt: 1,
    getProposalFunction: 'get_proposal',
    buildGetProposalArgs: (proposalId) => [{ type: 'int', value: proposalId }],
  },
  mapProposal: (raw, proposalId) => ({
    title: `Proposal #${proposalId}`,
    description: '',
    votesFor: raw.votes_for,
    votesAgainst: raw.votes_against,
    quorum: raw.quorum,
    deadlineLedger: raw.deadline,
    executed: raw.executed ?? false,
  }),
  getVoteFunction: 'get_vote',
  buildGetVoteArgs: (proposalId, voter) => [
    { type: 'int', value: proposalId },
    { type: 'address', value: voter },
  ],
  mapVote: (raw) => {
    if (raw === null || raw === undefined) return null;
    return { choice: raw ? 'for' : 'against', weight: null };
  },
  voteFunction: 'vote',
  buildVoteArgs: (proposalId, choice, voter) => [
    { type: 'address', value: voter },
    { type: 'int', value: proposalId },
    { type: 'bool', value: String(choice === 'for') },
  ],
};

// ─── Worked example adapter: a differently-shaped committee contract ───────

type CommitteeStatus = 'Draft' | 'Voting' | 'Executed' | 'Failed';

interface CommitteeProposalRaw {
  id: number;
  title: string;
  description: string;
  tally: { for: NumericLike; against: NumericLike; abstain: NumericLike };
  quorum: NumericLike;
  deadline_ledger: number;
  status: CommitteeStatus;
  votes: Record<string, VoteChoice>;
}

function mapCommitteeStatus(status: CommitteeStatus): ProposalStatus | undefined {
  switch (status) {
    case 'Executed':
      return 'executed';
    case 'Failed':
      return 'rejected';
    default:
      // 'Draft' / 'Voting' are left undefined so the shared active/pending
      // derivation logic (based on deadline_ledger) still applies.
      return undefined;
  }
}

/**
 * Demonstrates a contract with a fundamentally different shape than
 * `simpleVotingAdapter`: one RPC call returns every proposal as a full
 * struct (no per-id fetch), voting is three-way (for/against/abstain), the
 * contract already tracks an explicit status enum, on-chain title/description
 * exist, and "who voted" is embedded on the proposal rather than requiring a
 * separate read call. Governance.tsx needs no changes to render this adapter.
 */
export const exampleCommitteeGovernanceAdapter: GovernanceAdapter<CommitteeProposalRaw, never> = {
  id: 'committee-v1',
  displayName: 'Committee Governance (list-full, 3-way vote, explicit status)',
  discovery: {
    kind: 'list-full',
    listFunction: 'list_proposals',
    extractProposalId: (raw) => String((raw as CommitteeProposalRaw).id),
  },
  mapProposal: (raw) => ({
    title: raw.title,
    description: raw.description,
    votesFor: raw.tally.for,
    votesAgainst: raw.tally.against,
    votesAbstain: raw.tally.abstain,
    quorumBasis: 'forAgainstAbstain',
    quorum: raw.quorum,
    deadlineLedger: raw.deadline_ledger,
    executed: raw.status === 'Executed',
    explicitStatus: mapCommitteeStatus(raw.status),
  }),
  extractVoters: (raw) => raw.votes,
  supportsAbstain: true,
  voteFunction: 'cast_vote',
  buildVoteArgs: (proposalId, choice, voter) => [
    { type: 'int', value: proposalId },
    { type: 'address', value: voter },
    { type: 'string', value: choice },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GOVERNANCE_ADAPTERS: Record<string, GovernanceAdapter<any, any>> = {
  [simpleVotingAdapter.id]: simpleVotingAdapter,
  [exampleCommitteeGovernanceAdapter.id]: exampleCommitteeGovernanceAdapter,
};
