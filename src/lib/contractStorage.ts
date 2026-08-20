/**
 * Soroban contract storage inspection — RPC fetching, XDR decoding, TTL
 * formatting, and search/export helpers for the Storage dashboard tab.
 *
 * There is no RPC method to list all of a contract's persistent/temporary
 * storage keys, so those are discovered from ledger-key footprints recorded
 * against past simulate/invoke calls in the contract interaction history
 * (see lib/storage.ts). Instance storage is always fetched directly, since
 * its ledger key is fully determined by the contract ID alone.
 */
import * as StellarSdk from '@stellar/stellar-sdk';
import { decodeEventScVal, getSorobanServer, isValidContractId, type NetworkName } from './stellar';
import { getContractInteractions } from './storage';
import { normalizeContractValue } from './contractInvoker';
import { computeTimeRemaining, AVERAGE_LEDGER_CLOSE_SECONDS, type TimeRemaining } from './governance';

export type StorageDurability = 'instance' | 'persistent' | 'temporary';

export interface StorageEntry {
  id: string;
  durability: StorageDurability;
  key: unknown;
  keyRawXdr: string;
  keyDecoded: boolean;
  value: unknown;
  valueRawXdr: string;
  valueDecoded: boolean;
  liveUntilLedgerSeq: number | null;
  lastModifiedLedgerSeq: number | null;
}

export interface ContractStorageSnapshot {
  contractId: string;
  network: NetworkName;
  fetchedAt: string;
  latestLedger: number;
  entries: StorageEntry[];
  counts: Record<StorageDurability, number>;
  warnings: string[];
}

export interface StorageFilters {
  keyPrefix?: string;
  valueSubstring?: string;
  durability?: StorageDurability | 'all';
}

export interface StorageTtlInfo {
  hasTtl: boolean;
  isExpired: boolean;
  ledgersRemaining: number;
  label: string;
}

// The RPC caps how many ledger keys can be requested at once; chunk defensively.
const LEDGER_ENTRY_BATCH_SIZE = 200;

interface DecodedScVal {
  value: unknown;
  decoded: boolean;
  rawXdr: string;
}

/**
 * Decode an ScVal into a native value via stellar.ts's `decodeEventScVal`
 * (which wraps the SDK's `scValToNative`), and report whether decoding
 * actually succeeded so the UI can fall back to a raw-XDR view instead of
 * misrepresenting an undecodable entry as its own base64 XDR string.
 */
function decodeStorageScVal(scVal: StellarSdk.xdr.ScVal): DecodedScVal {
  const rawXdr = scVal.toXDR('base64');
  const value = decodeEventScVal(scVal);
  const decoded = !(typeof value === 'string' && value === rawXdr);
  return { value, decoded, rawXdr };
}

function toStorageEntry(
  durability: StorageDurability,
  keyScVal: StellarSdk.xdr.ScVal,
  valueScVal: StellarSdk.xdr.ScVal,
  liveUntilLedgerSeq: number | null,
  lastModifiedLedgerSeq: number | null,
): StorageEntry {
  const decodedKey = decodeStorageScVal(keyScVal);
  const decodedValue = decodeStorageScVal(valueScVal);

  return {
    id: `${durability}:${decodedKey.rawXdr}`,
    durability,
    key: decodedKey.value,
    keyRawXdr: decodedKey.rawXdr,
    keyDecoded: decodedKey.decoded,
    value: decodedValue.value,
    valueRawXdr: decodedValue.rawXdr,
    valueDecoded: decodedValue.decoded,
    liveUntilLedgerSeq,
    lastModifiedLedgerSeq,
  };
}

/**
 * Fetch and decode the contract's instance storage map — the key/value
 * pairs stored under `env.storage().instance()`. This is always readable
 * directly, since the ledger key only depends on the contract ID.
 */
export async function fetchInstanceStorageEntries(
  contractId: string,
  network: NetworkName = 'testnet',
): Promise<{ entries: StorageEntry[]; latestLedger: number }> {
  const server = getSorobanServer(network);
  const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: StellarSdk.Address.fromString(contractId).toScAddress(),
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    }),
  );

  const response = await server.getLedgerEntries(ledgerKey);
  const entry = response.entries?.[0];
  if (!entry) {
    return { entries: [], latestLedger: response.latestLedger ?? 0 };
  }

  const instanceScVal = entry.val.contractData().val();
  const mapEntries = instanceScVal.instance().storage() ?? [];

  const entries = mapEntries.map((mapEntry) =>
    toStorageEntry(
      'instance',
      mapEntry.key(),
      mapEntry.val(),
      entry.liveUntilLedgerSeq ?? null,
      entry.lastModifiedLedgerSeq ?? null,
    ),
  );

  return { entries, latestLedger: response.latestLedger ?? 0 };
}

interface StorageKeyCandidate {
  key: StellarSdk.xdr.ScVal;
  durability: 'persistent' | 'temporary';
}

/**
 * Mine persistent/temporary storage-key candidates out of the ledger-key
 * footprints already recorded in the contract interaction history (from
 * past "Simulate" calls in ContractInteraction/Contracts). This is the only
 * source available in the app for discovering keys, since Soroban RPC has
 * no "list keys" method.
 */
async function discoverStorageKeyCandidates(contractId: string): Promise<StorageKeyCandidate[]> {
  const records = await getContractInteractions({ contractId });
  const seen = new Map<string, StorageKeyCandidate>();

  for (const record of records) {
    const result = record.result as
      | { footprint?: { readOnly?: { type?: string; xdr?: string }[]; readWrite?: { type?: string; xdr?: string }[] } }
      | null
      | undefined;
    const footprintKeys = [
      ...(result?.footprint?.readOnly ?? []),
      ...(result?.footprint?.readWrite ?? []),
    ];

    for (const serializedKey of footprintKeys) {
      if (!serializedKey?.xdr || serializedKey.type !== 'contractData') continue;

      try {
        const ledgerKey = StellarSdk.xdr.LedgerKey.fromXDR(serializedKey.xdr, 'base64');
        const contractDataKey = ledgerKey.contractData();
        const entryContractId = StellarSdk.Address.fromScAddress(contractDataKey.contract()).toString();
        if (entryContractId !== contractId) continue;
        if (contractDataKey.key().switch().name === 'scvLedgerKeyContractInstance') continue;

        const durability = contractDataKey.durability().name;
        const dedupeKey = `${durability}:${contractDataKey.key().toXDR('base64')}`;
        if (!seen.has(dedupeKey)) {
          seen.set(dedupeKey, { key: contractDataKey.key(), durability });
        }
      } catch {
        // Not a decodable contract-data ledger key footprint; skip it.
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Resolve the current value (and TTL) of every persistent/temporary storage
 * key discovered from interaction history footprints.
 */
export async function fetchDiscoveredStorageEntries(
  contractId: string,
  network: NetworkName = 'testnet',
): Promise<{ entries: StorageEntry[]; latestLedger: number }> {
  const candidates = await discoverStorageKeyCandidates(contractId);
  if (candidates.length === 0) {
    return { entries: [], latestLedger: 0 };
  }

  const server = getSorobanServer(network);
  const contractAddress = StellarSdk.Address.fromString(contractId).toScAddress();

  const ledgerKeys = candidates.map(({ key, durability }) =>
    StellarSdk.xdr.LedgerKey.contractData(
      new StellarSdk.xdr.LedgerKeyContractData({
        contract: contractAddress,
        key,
        durability:
          durability === 'temporary'
            ? StellarSdk.xdr.ContractDataDurability.temporary()
            : StellarSdk.xdr.ContractDataDurability.persistent(),
      }),
    ),
  );

  const entries: StorageEntry[] = [];
  let latestLedger = 0;

  for (let offset = 0; offset < ledgerKeys.length; offset += LEDGER_ENTRY_BATCH_SIZE) {
    const batch = ledgerKeys.slice(offset, offset + LEDGER_ENTRY_BATCH_SIZE);
    const response = await server.getLedgerEntries(...batch);
    latestLedger = Math.max(latestLedger, response.latestLedger ?? 0);

    for (const entry of response.entries ?? []) {
      const contractDataEntry = entry.val.contractData();
      const durability: StorageDurability =
        contractDataEntry.durability().name === 'temporary' ? 'temporary' : 'persistent';

      entries.push(
        toStorageEntry(
          durability,
          contractDataEntry.key(),
          contractDataEntry.val(),
          entry.liveUntilLedgerSeq ?? null,
          entry.lastModifiedLedgerSeq ?? null,
        ),
      );
    }
  }

  return { entries, latestLedger };
}

/**
 * Build a full storage snapshot for a contract: instance storage (always
 * available) plus persistent/temporary entries discovered from interaction
 * history footprints (best-effort — a contract with no recorded
 * simulate/invoke history will only show instance storage).
 */
export async function fetchContractStorageSnapshot(
  contractId: string,
  network: NetworkName = 'testnet',
): Promise<ContractStorageSnapshot> {
  const trimmedId = contractId.trim();
  if (!isValidContractId(trimmedId)) {
    throw new Error('Enter a valid Soroban contract address');
  }

  const warnings: string[] = [];

  const [instanceResult, discoveredResult] = await Promise.all([
    fetchInstanceStorageEntries(trimmedId, network),
    fetchDiscoveredStorageEntries(trimmedId, network).catch((error: unknown) => {
      warnings.push(
        `Persistent/temporary entries could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { entries: [], latestLedger: 0 };
    }),
  ]);

  if (discoveredResult.entries.length === 0 && warnings.length === 0) {
    warnings.push(
      "No persistent or temporary entries were found in this contract's interaction history. " +
        'Simulate or invoke a function on this contract from the Contracts tab to discover more storage keys.',
    );
  }

  const entries = [...instanceResult.entries, ...discoveredResult.entries];
  const counts: Record<StorageDurability, number> = { instance: 0, persistent: 0, temporary: 0 };
  for (const entry of entries) counts[entry.durability] += 1;

  return {
    contractId: trimmedId,
    network,
    fetchedAt: new Date().toISOString(),
    latestLedger: Math.max(instanceResult.latestLedger, discoveredResult.latestLedger),
    entries,
    counts,
    warnings,
  };
}

/** Stringify a decoded key/value for display and substring/prefix filtering. */
export function stringifyStorageValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Filter entries by durability, key prefix, and value substring (case-insensitive). */
export function filterStorageEntries(entries: StorageEntry[], filters: StorageFilters): StorageEntry[] {
  const durability = filters.durability ?? 'all';
  const prefix = (filters.keyPrefix ?? '').trim().toLowerCase();
  const substring = (filters.valueSubstring ?? '').trim().toLowerCase();

  return entries.filter((entry) => {
    if (durability !== 'all' && entry.durability !== durability) return false;
    if (prefix && !stringifyStorageValue(entry.key).toLowerCase().startsWith(prefix)) return false;
    if (substring && !stringifyStorageValue(entry.value).toLowerCase().includes(substring)) return false;
    return true;
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/**
 * Compute a human-readable remaining-TTL indicator for an entry, reusing
 * governance.ts's ledger-based time-remaining math (Soroban and governance
 * deadlines are both expressed in ledger sequence numbers).
 */
export function formatStorageTtl(entry: StorageEntry, latestLedger: number): StorageTtlInfo {
  if (entry.liveUntilLedgerSeq == null) {
    return { hasTtl: false, isExpired: false, ledgersRemaining: 0, label: 'No TTL' };
  }

  const remaining: TimeRemaining = computeTimeRemaining(
    entry.liveUntilLedgerSeq,
    latestLedger,
    AVERAGE_LEDGER_CLOSE_SECONDS,
  );

  if (remaining.isClosed) {
    return { hasTtl: true, isExpired: true, ledgersRemaining: 0, label: 'Expired' };
  }

  return {
    hasTtl: true,
    isExpired: false,
    ledgersRemaining: remaining.ledgersRemaining,
    label: `${remaining.ledgersRemaining.toLocaleString()} ledgers (~${formatDuration(remaining.secondsRemaining)})`,
  };
}

/** Build a JSON-safe export payload for the currently displayed (filtered) entries. */
export function buildStorageExportPayload(
  snapshot: Pick<ContractStorageSnapshot, 'contractId' | 'network' | 'fetchedAt' | 'latestLedger'>,
  entries: StorageEntry[],
  filters: StorageFilters,
) {
  return normalizeContractValue({
    contractId: snapshot.contractId,
    network: snapshot.network,
    fetchedAt: snapshot.fetchedAt,
    latestLedger: snapshot.latestLedger,
    filters: {
      durability: filters.durability ?? 'all',
      keyPrefix: filters.keyPrefix ?? '',
      valueSubstring: filters.valueSubstring ?? '',
    },
    entryCount: entries.length,
    entries: entries.map((entry) => ({
      durability: entry.durability,
      key: entry.key,
      keyRawXdr: entry.keyRawXdr,
      keyDecoded: entry.keyDecoded,
      value: entry.value,
      valueRawXdr: entry.valueRawXdr,
      valueDecoded: entry.valueDecoded,
      liveUntilLedgerSeq: entry.liveUntilLedgerSeq,
      lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq,
    })),
  });
}
