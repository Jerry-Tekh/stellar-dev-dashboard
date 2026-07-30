import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  fetchInstanceStorageEntries,
  fetchDiscoveredStorageEntries,
  fetchContractStorageSnapshot,
  filterStorageEntries,
  formatStorageTtl,
  stringifyStorageValue,
  buildStorageExportPayload,
  type StorageEntry,
} from '../contractStorage';
import { getSorobanServer, isValidContractId, decodeEventScVal } from '../stellar';
import { getContractInteractions } from '../storage';

const decodeHolder = vi.hoisted(() => ({ real: (_input: unknown): unknown => undefined }));

vi.mock('../stellar', async () => {
  const actual = await vi.importActual<typeof import('../stellar')>('../stellar');
  decodeHolder.real = actual.decodeEventScVal;
  return {
    ...actual,
    getSorobanServer: vi.fn(),
    isValidContractId: vi.fn((id: string) => {
      try {
        StellarSdk.Address.fromString(id);
        return true;
      } catch {
        return false;
      }
    }),
    // Kept as a real spy (not a bare mock) so most tests exercise actual XDR
    // decoding; only the "decoding fallback" test overrides its behavior.
    decodeEventScVal: vi.fn((input: unknown) => decodeHolder.real(input)),
  };
});

vi.mock('../storage', () => ({
  getContractInteractions: vi.fn(),
}));

const CONTRACT_ID = StellarSdk.StrKey.encodeContract(new Uint8Array(32).fill(1) as unknown as Buffer);
const OTHER_CONTRACT_ID = StellarSdk.StrKey.encodeContract(new Uint8Array(32).fill(2) as unknown as Buffer);
const CONTRACT_ADDRESS = StellarSdk.Address.fromString(CONTRACT_ID).toScAddress();
// The generated .d.ts omits ExtensionPoint's constructor signature even though
// the runtime union type accepts a numeric switch value directly.
const EXT_ZERO = new (StellarSdk.xdr.ExtensionPoint as unknown as new (value: number) => StellarSdk.xdr.ExtensionPoint)(0);

function buildContractDataEntry(
  key: StellarSdk.xdr.ScVal,
  val: StellarSdk.xdr.ScVal,
  durability: StellarSdk.xdr.ContractDataDurability,
  contract: StellarSdk.xdr.ScAddress = CONTRACT_ADDRESS,
) {
  return StellarSdk.xdr.LedgerEntryData.contractData(
    new StellarSdk.xdr.ContractDataEntry({ ext: EXT_ZERO, contract, key, durability, val }),
  );
}

function buildInstanceEntry(mapEntries: StellarSdk.xdr.ScMapEntry[]) {
  const instance = new StellarSdk.xdr.ScContractInstance({
    executable: StellarSdk.xdr.ContractExecutable.contractExecutableStellarAsset(),
    storage: mapEntries,
  });
  return buildContractDataEntry(
    StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
    StellarSdk.xdr.ScVal.scvContractInstance(instance),
    StellarSdk.xdr.ContractDataDurability.persistent(),
  );
}

function buildLedgerKey(
  key: StellarSdk.xdr.ScVal,
  durability: StellarSdk.xdr.ContractDataDurability,
  contract: StellarSdk.xdr.ScAddress = CONTRACT_ADDRESS,
) {
  return StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({ contract, key, durability }),
  );
}

describe('contractStorage', () => {
  let mockServer: { getLedgerEntries: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = { getLedgerEntries: vi.fn() };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer as never);
    vi.mocked(getContractInteractions).mockResolvedValue([]);
  });

  describe('fetchInstanceStorageEntries', () => {
    it('decodes every key/value pair in the instance storage map', async () => {
      const mapEntry = new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.nativeToScVal('COUNTER', { type: 'symbol' }),
        val: StellarSdk.nativeToScVal(42, { type: 'u32' }),
      });
      const entry = buildInstanceEntry([mapEntry]);

      mockServer.getLedgerEntries.mockResolvedValue({
        entries: [{ val: entry, liveUntilLedgerSeq: 5000, lastModifiedLedgerSeq: 4000 }],
        latestLedger: 4500,
      });

      const result = await fetchInstanceStorageEntries(CONTRACT_ID, 'testnet');

      expect(result.latestLedger).toBe(4500);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        durability: 'instance',
        key: 'COUNTER',
        value: 42,
        keyDecoded: true,
        valueDecoded: true,
        liveUntilLedgerSeq: 5000,
        lastModifiedLedgerSeq: 4000,
      });
    });

    it('returns no entries when the contract instance ledger entry is missing', async () => {
      mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 100 });
      const result = await fetchInstanceStorageEntries(CONTRACT_ID, 'testnet');
      expect(result.entries).toEqual([]);
    });
  });

  describe('fetchDiscoveredStorageEntries', () => {
    it('discovers persistent/temporary keys from interaction-history footprints and resolves their current values', async () => {
      const persistentKey = StellarSdk.nativeToScVal('balance', { type: 'symbol' });
      const persistentLedgerKey = buildLedgerKey(persistentKey, StellarSdk.xdr.ContractDataDurability.persistent());

      const temporaryKey = StellarSdk.nativeToScVal('nonce', { type: 'symbol' });
      const temporaryLedgerKey = buildLedgerKey(temporaryKey, StellarSdk.xdr.ContractDataDurability.temporary());

      vi.mocked(getContractInteractions).mockResolvedValue([
        {
          id: 'rec-1',
          contractId: CONTRACT_ID,
          timestamp: Date.now(),
          type: 'simulate',
          status: 'success',
          result: {
            footprint: {
              readOnly: [{ type: 'contractData', xdr: persistentLedgerKey.toXDR('base64') }],
              readWrite: [{ type: 'contractData', xdr: temporaryLedgerKey.toXDR('base64') }],
            },
          },
        } as never,
      ]);

      mockServer.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            val: buildContractDataEntry(
              persistentKey,
              StellarSdk.nativeToScVal(1000, { type: 'i128' }),
              StellarSdk.xdr.ContractDataDurability.persistent(),
            ),
            liveUntilLedgerSeq: null,
            lastModifiedLedgerSeq: 900,
          },
          {
            val: buildContractDataEntry(
              temporaryKey,
              StellarSdk.nativeToScVal(true, { type: 'bool' }),
              StellarSdk.xdr.ContractDataDurability.temporary(),
            ),
            liveUntilLedgerSeq: 1200,
            lastModifiedLedgerSeq: 900,
          },
        ],
        latestLedger: 1000,
      });

      const result = await fetchDiscoveredStorageEntries(CONTRACT_ID, 'testnet');

      expect(mockServer.getLedgerEntries).toHaveBeenCalledTimes(1);
      expect(result.entries).toHaveLength(2);
      const byDurability = Object.fromEntries(result.entries.map((e) => [e.durability, e]));
      expect(byDurability.persistent.key).toBe('balance');
      expect(byDurability.persistent.value).toBe(1000n);
      expect(byDurability.temporary.key).toBe('nonce');
      expect(byDurability.temporary.value).toBe(true);
      expect(byDurability.temporary.liveUntilLedgerSeq).toBe(1200);
    });

    it('ignores footprint entries belonging to a different contract, and dedupes repeated keys', async () => {
      const key = StellarSdk.nativeToScVal('shared', { type: 'symbol' });
      const otherContractAddress = StellarSdk.Address.fromString(OTHER_CONTRACT_ID).toScAddress();
      const ownKey = buildLedgerKey(key, StellarSdk.xdr.ContractDataDurability.persistent());
      const foreignKey = buildLedgerKey(
        key,
        StellarSdk.xdr.ContractDataDurability.persistent(),
        otherContractAddress,
      );

      vi.mocked(getContractInteractions).mockResolvedValue([
        {
          id: 'rec-1',
          contractId: CONTRACT_ID,
          timestamp: 1,
          result: {
            footprint: {
              readOnly: [{ type: 'contractData', xdr: ownKey.toXDR('base64') }],
              readWrite: [],
            },
          },
        } as never,
        {
          id: 'rec-2',
          contractId: CONTRACT_ID,
          timestamp: 2,
          result: {
            footprint: {
              readOnly: [
                { type: 'contractData', xdr: ownKey.toXDR('base64') },
                { type: 'contractData', xdr: foreignKey.toXDR('base64') },
              ],
              readWrite: [],
            },
          },
        } as never,
      ]);

      mockServer.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            val: buildContractDataEntry(
              key,
              StellarSdk.nativeToScVal('shared-value', { type: 'string' }),
              StellarSdk.xdr.ContractDataDurability.persistent(),
            ),
            liveUntilLedgerSeq: null,
            lastModifiedLedgerSeq: 1,
          },
        ],
        latestLedger: 10,
      });

      const result = await fetchDiscoveredStorageEntries(CONTRACT_ID, 'testnet');

      // Only one ledger key was requested: the duplicate + foreign-contract entries were filtered out.
      const requestedKeys = mockServer.getLedgerEntries.mock.calls[0];
      expect(requestedKeys).toHaveLength(1);
      expect(result.entries).toHaveLength(1);
    });

    it('returns no entries and skips the RPC call when there is no interaction history', async () => {
      vi.mocked(getContractInteractions).mockResolvedValue([]);
      const result = await fetchDiscoveredStorageEntries(CONTRACT_ID, 'testnet');
      expect(result).toEqual({ entries: [], latestLedger: 0 });
      expect(mockServer.getLedgerEntries).not.toHaveBeenCalled();
    });
  });

  describe('fetchContractStorageSnapshot', () => {
    it('rejects an invalid contract address before making any RPC calls', async () => {
      await expect(fetchContractStorageSnapshot('not-a-contract', 'testnet')).rejects.toThrow(
        'Enter a valid Soroban contract address',
      );
      expect(mockServer.getLedgerEntries).not.toHaveBeenCalled();
    });

    it('combines instance storage with discovered entries and tallies counts per durability', async () => {
      const mapEntry = new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.nativeToScVal('admin', { type: 'symbol' }),
        val: StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
      });

      vi.mocked(getContractInteractions).mockResolvedValue([
        {
          id: 'rec-1',
          contractId: CONTRACT_ID,
          timestamp: 1,
          result: {
            footprint: {
              readOnly: [
                {
                  type: 'contractData',
                  xdr: buildLedgerKey(
                    StellarSdk.nativeToScVal('total', { type: 'symbol' }),
                    StellarSdk.xdr.ContractDataDurability.persistent(),
                  ).toXDR('base64'),
                },
              ],
              readWrite: [],
            },
          },
        } as never,
      ]);

      // First RPC call resolves instance storage; second resolves the discovered "total" key.
      mockServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [{ val: buildInstanceEntry([mapEntry]), liveUntilLedgerSeq: 9000, lastModifiedLedgerSeq: 1 }],
          latestLedger: 2000,
        })
        .mockResolvedValueOnce({
          entries: [
            {
              val: buildContractDataEntry(
                StellarSdk.nativeToScVal('total', { type: 'symbol' }),
                StellarSdk.nativeToScVal(7, { type: 'u32' }),
                StellarSdk.xdr.ContractDataDurability.persistent(),
              ),
              liveUntilLedgerSeq: null,
              lastModifiedLedgerSeq: 1,
            },
          ],
          latestLedger: 2000,
        });

      const snapshot = await fetchContractStorageSnapshot(CONTRACT_ID, 'testnet');

      expect(snapshot.counts).toEqual({ instance: 1, persistent: 1, temporary: 0 });
      expect(snapshot.entries).toHaveLength(2);
      expect(snapshot.warnings).toEqual([]);
      expect(snapshot.latestLedger).toBe(2000);
    });

    it('adds a warning instead of throwing when no persistent/temporary entries were discovered', async () => {
      mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 500 });
      vi.mocked(getContractInteractions).mockResolvedValue([]);

      const snapshot = await fetchContractStorageSnapshot(CONTRACT_ID, 'testnet');

      expect(snapshot.warnings).toHaveLength(1);
      expect(snapshot.warnings[0]).toMatch(/interaction history/i);
    });
  });

  describe('decoding fallback', () => {
    it('falls back to a labeled raw-XDR entry when the value cannot be decoded to native JS', async () => {
      // Force decodeEventScVal (reused from stellar.ts) into its documented failure path,
      // which returns the base64 XDR string unchanged instead of throwing.
      const decodeSpy = vi.mocked(decodeEventScVal);
      const mapEntry = new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.nativeToScVal('weird', { type: 'symbol' }),
        val: StellarSdk.nativeToScVal(1, { type: 'u32' }),
      });
      const rawValXdr = mapEntry.val().toXDR('base64');
      decodeSpy.mockImplementation((input: unknown) => {
        if (input === mapEntry.key()) return 'weird';
        return rawValXdr;
      });

      mockServer.getLedgerEntries.mockResolvedValue({
        entries: [{ val: buildInstanceEntry([mapEntry]), liveUntilLedgerSeq: null, lastModifiedLedgerSeq: 1 }],
        latestLedger: 100,
      });

      const result = await fetchInstanceStorageEntries(CONTRACT_ID, 'testnet');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].valueDecoded).toBe(false);
      expect(result.entries[0].value).toBe(rawValXdr);
      expect(result.entries[0].valueRawXdr).toBe(rawValXdr);

      decodeSpy.mockImplementation((input: unknown) => decodeHolder.real(input));
    });
  });

  describe('formatStorageTtl', () => {
    const baseEntry: StorageEntry = {
      id: 'persistent:abc',
      durability: 'persistent',
      key: 'k',
      keyRawXdr: '',
      keyDecoded: true,
      value: 'v',
      valueRawXdr: '',
      valueDecoded: true,
      liveUntilLedgerSeq: null,
      lastModifiedLedgerSeq: null,
    };

    it('reports no TTL for entries without a liveUntilLedgerSeq', () => {
      const info = formatStorageTtl(baseEntry, 1000);
      expect(info).toEqual({ hasTtl: false, isExpired: false, ledgersRemaining: 0, label: 'No TTL' });
    });

    it('reports remaining ledgers and an estimated duration for a live entry', () => {
      const info = formatStorageTtl({ ...baseEntry, liveUntilLedgerSeq: 1100 }, 1000);
      expect(info.hasTtl).toBe(true);
      expect(info.isExpired).toBe(false);
      expect(info.ledgersRemaining).toBe(100);
      expect(info.label).toContain('100');
    });

    it('reports an expired entry once the current ledger passes liveUntilLedgerSeq', () => {
      const info = formatStorageTtl({ ...baseEntry, liveUntilLedgerSeq: 900 }, 1000);
      expect(info).toEqual({ hasTtl: true, isExpired: true, ledgersRemaining: 0, label: 'Expired' });
    });
  });

  describe('filterStorageEntries', () => {
    const entries: StorageEntry[] = [
      {
        id: 'instance:1',
        durability: 'instance',
        key: 'admin',
        keyRawXdr: '',
        keyDecoded: true,
        value: 'GADMIN',
        valueRawXdr: '',
        valueDecoded: true,
        liveUntilLedgerSeq: null,
        lastModifiedLedgerSeq: null,
      },
      {
        id: 'persistent:1',
        durability: 'persistent',
        key: 'balance_alice',
        keyRawXdr: '',
        keyDecoded: true,
        value: 500,
        valueRawXdr: '',
        valueDecoded: true,
        liveUntilLedgerSeq: null,
        lastModifiedLedgerSeq: null,
      },
      {
        id: 'temporary:1',
        durability: 'temporary',
        key: 'nonce_bob',
        keyRawXdr: '',
        keyDecoded: true,
        value: 1,
        valueRawXdr: '',
        valueDecoded: true,
        liveUntilLedgerSeq: null,
        lastModifiedLedgerSeq: null,
      },
    ];

    it('filters by durability', () => {
      expect(filterStorageEntries(entries, { durability: 'persistent' })).toHaveLength(1);
      expect(filterStorageEntries(entries, { durability: 'all' })).toHaveLength(3);
    });

    it('filters by key prefix, case-insensitively', () => {
      const result = filterStorageEntries(entries, { keyPrefix: 'BALANCE_' });
      expect(result.map((e) => e.id)).toEqual(['persistent:1']);
    });

    it('filters by value substring', () => {
      const result = filterStorageEntries(entries, { valueSubstring: 'admin' });
      expect(result.map((e) => e.id)).toEqual(['instance:1']);
    });

    it('combines durability and text filters', () => {
      const result = filterStorageEntries(entries, { durability: 'temporary', keyPrefix: 'nonce' });
      expect(result.map((e) => e.id)).toEqual(['temporary:1']);
    });
  });

  describe('stringifyStorageValue', () => {
    it('stringifies bigints without throwing', () => {
      expect(stringifyStorageValue(123n)).toBe('123');
    });

    it('stringifies nested objects containing bigints', () => {
      expect(stringifyStorageValue({ amount: 5n })).toBe('{"amount":"5"}');
    });

    it('returns an empty string for null/undefined', () => {
      expect(stringifyStorageValue(null)).toBe('');
      expect(stringifyStorageValue(undefined)).toBe('');
    });
  });

  describe('buildStorageExportPayload', () => {
    it('produces a JSON-safe payload whose displayed values round-trip through JSON.stringify/parse', () => {
      const entries: StorageEntry[] = [
        {
          id: 'persistent:1',
          durability: 'persistent',
          key: 'balance',
          keyRawXdr: 'AAA=',
          keyDecoded: true,
          value: 9007199254740993n,
          valueRawXdr: 'BBB=',
          valueDecoded: true,
          liveUntilLedgerSeq: 5000,
          lastModifiedLedgerSeq: 4000,
        },
      ];

      const payload = buildStorageExportPayload(
        { contractId: CONTRACT_ID, network: 'testnet', fetchedAt: '2026-01-01T00:00:00.000Z', latestLedger: 4500 },
        entries,
        { durability: 'persistent', keyPrefix: '', valueSubstring: '' },
      );

      const serialized = JSON.stringify(payload);
      const parsed = JSON.parse(serialized);

      expect(parsed.entries[0].key).toBe('balance');
      expect(parsed.entries[0].value).toBe('9007199254740993');
      expect(parsed.entries[0].liveUntilLedgerSeq).toBe(5000);
      expect(parsed.entryCount).toBe(1);
      expect(parsed.contractId).toBe(CONTRACT_ID);
    });
  });
});
