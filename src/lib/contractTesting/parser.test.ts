import { describe, expect, it } from 'vitest';
import { classifyType, parseContract, splitTopLevel } from './parser';
import { SAMPLE_CONTRACTS, findSampleContract } from './fixtures';

describe('splitTopLevel', () => {
  it('splits simple comma lists', () => {
    expect(splitTopLevel('env: Env, to: Address, amount: i128')).toEqual([
      'env: Env',
      'to: Address',
      'amount: i128',
    ]);
  });

  it('respects nested generic brackets', () => {
    expect(splitTopLevel('env: Env, data: Map<u32, Vec<Address>>, flag: bool')).toEqual([
      'env: Env',
      'data: Map<u32, Vec<Address>>',
      'flag: bool',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(splitTopLevel('   ')).toEqual([]);
  });
});

describe('classifyType', () => {
  it.each([
    ['Address', 'Address'],
    ['i128', 'i128'],
    ['u32', 'u32'],
    ['Vec<Address>', 'Vec'],
    ['Map<u32, i128>', 'Map'],
    ['BytesN<32>', 'BytesN'],
    ['&Address', 'Address'],
    ['Option<i128>', 'unknown'],
  ])('classifies %s as %s', (input, expected) => {
    expect(classifyType(input)).toBe(expected);
  });
});

describe('parseContract', () => {
  const tokenSource = findSampleContract('token')!.source;

  it('extracts the contract name from #[contract]', () => {
    expect(parseContract(tokenSource).contractName).toBe('TokenContract');
  });

  it('finds every pub fn inside #[contractimpl]', () => {
    const parsed = parseContract(tokenSource);
    expect(parsed.functions.map((fn) => fn.name).sort()).toEqual(
      ['balance', 'initialize', 'mint', 'transfer'].sort()
    );
  });

  it('parses parameter names and types, skipping env', () => {
    const parsed = parseContract(tokenSource);
    const transfer = parsed.functions.find((fn) => fn.name === 'transfer')!;
    expect(transfer.params.map((p) => `${p.name}:${p.kind}`)).toEqual([
      'from:Address',
      'to:Address',
      'amount:i128',
    ]);
  });

  it('detects require_auth usage', () => {
    const parsed = parseContract(tokenSource);
    const transfer = parsed.functions.find((fn) => fn.name === 'transfer')!;
    const balance = parsed.functions.find((fn) => fn.name === 'balance')!;
    expect(transfer.hasAuthCheck).toBe(true);
    expect(balance.hasAuthCheck).toBe(false);
  });

  it('detects panic risk from panic! and unwrap', () => {
    const parsed = parseContract(tokenSource);
    const transfer = parsed.functions.find((fn) => fn.name === 'transfer')!;
    expect(transfer.hasPanicRisk).toBe(true);
  });

  it('detects storage writes and marks state mutation', () => {
    const parsed = parseContract(tokenSource);
    const mint = parsed.functions.find((fn) => fn.name === 'mint')!;
    const balance = parsed.functions.find((fn) => fn.name === 'balance')!;
    expect(mint.hasStorageWrite).toBe(true);
    expect(mint.mutatesState).toBe(true);
    expect(balance.mutatesState).toBe(false);
  });

  it('detects cross-contract calls', () => {
    const escrow = parseContract(findSampleContract('escrow')!.source);
    expect(escrow.usesCrossContractCalls).toBe(true);
    const release = escrow.functions.find((fn) => fn.name === 'release')!;
    expect(release.hasExternalCall).toBe(true);
    expect(release.hasAuthCheck).toBe(false);
  });

  it('parses #[contracttype] struct/enum declarations', () => {
    const parsed = parseContract(tokenSource);
    expect(parsed.types).toEqual([{ name: 'DataKey', kind: 'enum', line: expect.any(Number) }]);
  });

  it('handles source with no functions gracefully', () => {
    const parsed = parseContract('#![no_std]\n// nothing here\n');
    expect(parsed.functions).toEqual([]);
    expect(parsed.contractName).toBe('Contract');
  });

  it('parses every bundled sample contract without throwing', () => {
    for (const sample of SAMPLE_CONTRACTS) {
      expect(() => parseContract(sample.source)).not.toThrow();
      expect(parseContract(sample.source).functions.length).toBeGreaterThan(0);
    }
  });
});
