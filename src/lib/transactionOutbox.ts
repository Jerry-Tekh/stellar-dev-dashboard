import * as StellarSdk from '@stellar/stellar-sdk'
import { getServer, getSorobanServer, NETWORKS, type NetworkName } from './stellar'
import { measureAsync } from './performanceMonitoring'

const DB_NAME = 'stellar-transaction-outbox'
const DB_VERSION = 1
const STORE_NAME = 'transactions'
const SUBMIT_LEASE_MS = 60_000
export const OUTBOX_SYNC_TAG = 'stellar-transaction-outbox'

export type OutboxStatus = 'queued' | 'submitting' | 'confirmed' | 'failed' | 'expired'
export type OutboxSubmissionKind = 'horizon' | 'soroban'

export interface TransactionOutboxItem {
  id: string
  xdr: string
  network: NetworkName
  horizonUrl: string
  submissionKind?: OutboxSubmissionKind
  rpcUrl?: string
  status: OutboxStatus
  createdAt: number
  updatedAt: number
  attempts: number
  expiresAt: number | null
  submitLeaseUntil?: number
  hash?: string
  ledger?: number
  successful?: boolean
  error?: string
}

export interface OutboxSubmissionResult {
  hash: string
  ledger?: number
  successful?: boolean
}

export interface TransactionOutboxRepository {
  put(_item: TransactionOutboxItem): Promise<void>
  get(_id: string): Promise<TransactionOutboxItem | undefined>
  getAll(): Promise<TransactionOutboxItem[]>
  deleteIfNotSubmitting(_id: string): Promise<boolean>
  claim(
    _id: string,
    _now: number,
    _includeFailed: boolean,
  ): Promise<TransactionOutboxItem | undefined>
}

type OutboxSubmitter = (_item: TransactionOutboxItem) => Promise<OutboxSubmissionResult>
type OutboxListener = (_items: TransactionOutboxItem[]) => void

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

let databasePromise: Promise<IDBDatabase> | null = null

function openOutboxDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        databasePromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error)
    }
    request.onblocked = () => {
      databasePromise = null
      reject(new Error('Transaction outbox IndexedDB upgrade was blocked'))
    }
  })

  return databasePromise
}

export class IndexedDbOutboxRepository implements TransactionOutboxRepository {
  async put(item: TransactionOutboxItem): Promise<void> {
    const db = await openOutboxDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(item)
    await transactionComplete(transaction)
  }

  async get(id: string): Promise<TransactionOutboxItem | undefined> {
    const db = await openOutboxDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    return requestResult(transaction.objectStore(STORE_NAME).get(id))
  }

  async getAll(): Promise<TransactionOutboxItem[]> {
    const db = await openOutboxDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const items = await requestResult<TransactionOutboxItem[]>(
      transaction.objectStore(STORE_NAME).getAll(),
    )
    return items.sort((a, b) => b.createdAt - a.createdAt)
  }

  async deleteIfNotSubmitting(id: string): Promise<boolean> {
    const db = await openOutboxDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)
      let deleted = false

      request.onsuccess = () => {
        const item = request.result as TransactionOutboxItem | undefined
        if (item && item.status !== 'submitting') {
          store.delete(id)
          deleted = true
        }
      }
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => resolve(deleted)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  async claim(
    id: string,
    now: number,
    includeFailed: boolean,
  ): Promise<TransactionOutboxItem | undefined> {
    const db = await openOutboxDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)
      let claimed: TransactionOutboxItem | undefined

      request.onsuccess = () => {
        const item = request.result as TransactionOutboxItem | undefined
        if (!item) return

        if (item.expiresAt !== null && item.expiresAt <= now) {
          store.put({
            ...item,
            status: 'expired',
            updatedAt: now,
            submitLeaseUntil: undefined,
            error: 'The transaction time bound has passed and it can no longer be submitted.',
          })
          return
        }

        const staleSubmission =
          item.status === 'submitting' && (item.submitLeaseUntil ?? 0) <= now
        const canClaim =
          item.status === 'queued' ||
          staleSubmission ||
          (includeFailed && item.status === 'failed')

        if (!canClaim) return

        claimed = {
          ...item,
          status: 'submitting',
          attempts: item.attempts + 1,
          updatedAt: now,
          submitLeaseUntil: now + SUBMIT_LEASE_MS,
          error: undefined,
        }
        store.put(claimed)
      }

      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => resolve(claimed)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }
}

function decodeTransaction(
  xdr: string,
  network: NetworkName,
): StellarSdk.Transaction | StellarSdk.FeeBumpTransaction {
  return StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORKS[network].passphrase)
}

function innerTransaction(
  transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
): StellarSdk.Transaction {
  if ('innerTransaction' in transaction) {
    return transaction.innerTransaction
  }
  return transaction
}

export function getTransactionExpiry(xdr: string, network: NetworkName): number | null {
  const transaction = innerTransaction(decodeTransaction(xdr, network))
  const maxTime = transaction.timeBounds?.maxTime
  if (maxTime === undefined || maxTime === null || String(maxTime) === '0') return null

  const seconds = Number(maxTime)
  return Number.isFinite(seconds) ? seconds * 1000 : null
}

function transactionId(
  xdr: string,
  network: NetworkName,
  submissionKind: OutboxSubmissionKind,
): string {
  const hash = decodeTransaction(xdr, network)
    .hash()
    .toString('hex')
  return `${submissionKind}:${network}:${hash}`
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isRetryableSubmissionError(error: unknown): boolean {
  if (!isBrowserOnline()) return true
  if (error instanceof TypeError) return true

  const response = (error as { response?: { status?: number } } | null)?.response
  const status = response?.status
  return status === undefined || status === 408 || status === 429 || status >= 500
}

class PermanentSubmissionError extends Error {}

async function defaultSubmitter(item: TransactionOutboxItem): Promise<OutboxSubmissionResult> {
  const transaction = decodeTransaction(item.xdr, item.network)

  if (item.submissionKind === 'soroban') {
    const response = await measureAsync(
      'TRANSACTION_SUBMIT_DURATION',
      () => getSorobanServer(item.network).sendTransaction(transaction),
      {
        network: item.network,
        operationCount: innerTransaction(transaction).operations?.length || 0,
        source: 'transaction-outbox-soroban',
      },
    )

    if (response.status === 'ERROR') {
      const errorResult = response.errorResult?.toXDR('base64')
      throw new PermanentSubmissionError(
        errorResult
          ? `Soroban RPC rejected the transaction: ${errorResult}`
          : 'Soroban RPC rejected the transaction.',
      )
    }

    return {
      hash: response.hash,
      ledger: response.latestLedger,
      successful: true,
    }
  }

  const response = await measureAsync(
    'TRANSACTION_SUBMIT_DURATION',
    () => getServer(item.network).submitTransaction(transaction),
    {
      network: item.network,
      operationCount: innerTransaction(transaction).operations?.length || 0,
      source: 'transaction-outbox',
    },
  )

  return {
    hash: response.hash,
    ledger: response.ledger,
    successful: response.successful,
  }
}

export class TransactionOutboxService {
  private readonly repository: TransactionOutboxRepository
  private readonly submitter: OutboxSubmitter
  private readonly now: () => number
  private readonly online: () => boolean
  private readonly inFlight = new Map<string, Promise<TransactionOutboxItem | undefined>>()
  private readonly listeners = new Set<OutboxListener>()
  private leaseRecoveryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: {
    repository?: TransactionOutboxRepository
    submitter?: OutboxSubmitter
    now?: () => number
    online?: () => boolean
  } = {}) {
    this.repository = options.repository ?? new IndexedDbOutboxRepository()
    this.submitter = options.submitter ?? defaultSubmitter
    this.now = options.now ?? Date.now
    this.online = options.online ?? isBrowserOnline
  }

  async list(): Promise<TransactionOutboxItem[]> {
    return this.repository.getAll()
  }

  subscribe(listener: OutboxListener): () => void {
    this.listeners.add(listener)
    void this.list().then((items) => {
      if (this.listeners.has(listener)) listener(items)
    })
    return () => this.listeners.delete(listener)
  }

  private async notify(): Promise<void> {
    const items = await this.list()
    this.listeners.forEach((listener) => {
      try {
        listener(items)
      } catch {
        // A view listener must never affect durable submission state.
      }
    })
  }

  async refresh(): Promise<void> {
    await this.notify()
  }

  async queue(
    xdr: string,
    network: NetworkName,
    submissionKind: OutboxSubmissionKind = 'horizon',
  ): Promise<TransactionOutboxItem> {
    const normalizedXdr = xdr.trim()
    const id = transactionId(normalizedXdr, network, submissionKind)
    const existing = await this.repository.get(id)
    if (existing) return existing

    const now = this.now()
    const expiresAt = getTransactionExpiry(normalizedXdr, network)
    const item: TransactionOutboxItem = {
      id,
      xdr: normalizedXdr,
      network,
      horizonUrl: NETWORKS[network].horizonUrl || NETWORKS.testnet.horizonUrl,
      submissionKind,
      rpcUrl: NETWORKS[network].sorobanUrl,
      status: expiresAt !== null && expiresAt <= now ? 'expired' : 'queued',
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      expiresAt,
      error:
        expiresAt !== null && expiresAt <= now
          ? 'The transaction time bound has passed and it can no longer be submitted.'
          : undefined,
    }
    await this.repository.put(item)
    await this.notify()
    if (item.status === 'queued') void requestBackgroundSync()
    return item
  }

  async enqueueAndSubmit(
    xdr: string,
    network: NetworkName,
    submissionKind: OutboxSubmissionKind = 'horizon',
  ): Promise<TransactionOutboxItem> {
    const queued = await this.queue(xdr, network, submissionKind)
    if (queued.status !== 'queued' || !this.online()) return queued
    return (await this.submit(queued.id)) ?? queued
  }

  submit(id: string, includeFailed = false): Promise<TransactionOutboxItem | undefined> {
    const current = this.inFlight.get(id)
    if (current) return current

    const submission = this.performSubmission(id, includeFailed).finally(() => {
      this.inFlight.delete(id)
    })
    this.inFlight.set(id, submission)
    return submission
  }

  async retry(id: string): Promise<TransactionOutboxItem | undefined> {
    if (!this.online()) return this.repository.get(id)
    return this.submit(id, true)
  }

  private async performSubmission(
    id: string,
    includeFailed: boolean,
  ): Promise<TransactionOutboxItem | undefined> {
    const claimed = await this.repository.claim(id, this.now(), includeFailed)
    if (!claimed) {
      await this.notify()
      return this.repository.get(id)
    }
    await this.notify()

    try {
      const result = await this.submitter(claimed)
      const confirmed: TransactionOutboxItem = {
        ...claimed,
        status: 'confirmed',
        updatedAt: this.now(),
        submitLeaseUntil: undefined,
        hash: result.hash,
        ledger: result.ledger,
        successful: result.successful ?? true,
        error: undefined,
      }
      await this.repository.put(confirmed)
      await this.notify()
      return confirmed
    } catch (error) {
      const retryable =
        !(error instanceof PermanentSubmissionError) && isRetryableSubmissionError(error)
      const next: TransactionOutboxItem = {
        ...claimed,
        status: retryable ? 'queued' : 'failed',
        updatedAt: this.now(),
        submitLeaseUntil: undefined,
        error: errorMessage(error),
      }
      await this.repository.put(next)
      await this.notify()
      if (retryable) void requestBackgroundSync()
      return next
    }
  }

  async flush(): Promise<TransactionOutboxItem[]> {
    if (!this.online()) return this.list()

    const items = await this.list()
    for (const item of items) {
      if (item.status === 'queued' || item.status === 'submitting') {
        await this.submit(item.id)
      }
    }
    const latest = await this.list()
    this.scheduleLeaseRecovery(latest)
    return latest
  }

  private scheduleLeaseRecovery(items: TransactionOutboxItem[]): void {
    if (this.leaseRecoveryTimer) {
      clearTimeout(this.leaseRecoveryTimer)
      this.leaseRecoveryTimer = null
    }

    const leases = items
      .filter((item) => item.status === 'submitting' && item.submitLeaseUntil)
      .map((item) => item.submitLeaseUntil as number)
    if (leases.length === 0) return

    const nextLease = Math.min(...leases)
    this.leaseRecoveryTimer = setTimeout(() => {
      this.leaseRecoveryTimer = null
      void this.flush()
    }, Math.max(0, nextLease - this.now()) + 25)
  }

  async discard(id: string): Promise<void> {
    if (this.inFlight.has(id)) return
    await this.repository.deleteIfNotSubmitting(id)
    await this.notify()
  }
}

export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.sync?.register(OUTBOX_SYNC_TAG)
  } catch {
    // The online event remains the universal fallback.
  }
}

export const transactionOutbox = new TransactionOutboxService()

let initialized = false

export function initializeTransactionOutbox(
  outbox: TransactionOutboxService = transactionOutbox,
): () => void {
  if (initialized || typeof window === 'undefined') return () => {}
  initialized = true

  const flush = () => {
    void outbox.flush()
  }
  window.addEventListener('online', flush)
  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type === 'TRANSACTION_OUTBOX_CHANGED') {
      void outbox.refresh()
    }
  }
  navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)
  if (isBrowserOnline()) flush()

  return () => {
    window.removeEventListener('online', flush)
    navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
    initialized = false
  }
}
