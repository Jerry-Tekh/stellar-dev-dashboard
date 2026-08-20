import { afterEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import * as StellarSdk from '@stellar/stellar-sdk'
import {
  IndexedDbOutboxRepository,
  TransactionOutboxService,
  getTransactionExpiry,
  initializeTransactionOutbox,
  type TransactionOutboxItem,
  type TransactionOutboxRepository,
} from '../../../src/lib/transactionOutbox'

class MemoryOutboxRepository implements TransactionOutboxRepository {
  readonly items = new Map<string, TransactionOutboxItem>()

  async put(item: TransactionOutboxItem) {
    this.items.set(item.id, structuredClone(item))
  }

  async get(id: string) {
    const item = this.items.get(id)
    return item ? structuredClone(item) : undefined
  }

  async getAll() {
    return [...this.items.values()].map((item) => structuredClone(item))
  }

  async deleteIfNotSubmitting(id: string) {
    const item = this.items.get(id)
    if (!item || item.status === 'submitting') return false
    return this.items.delete(id)
  }

  async claim(id: string, now: number, includeFailed: boolean) {
    const item = this.items.get(id)
    if (!item) return undefined

    if (item.expiresAt !== null && item.expiresAt <= now) {
      this.items.set(id, {
        ...item,
        status: 'expired',
        updatedAt: now,
        error: 'The transaction time bound has passed and it can no longer be submitted.',
      })
      return undefined
    }

    const stale = item.status === 'submitting' && (item.submitLeaseUntil ?? 0) <= now
    if (
      item.status !== 'queued' &&
      !stale &&
      !(includeFailed && item.status === 'failed')
    ) {
      return undefined
    }

    const claimed: TransactionOutboxItem = {
      ...item,
      status: 'submitting',
      attempts: item.attempts + 1,
      updatedAt: now,
      submitLeaseUntil: now + 60_000,
      error: undefined,
    }
    this.items.set(id, claimed)
    return structuredClone(claimed)
  }
}

function buildTransaction(maxTimeSeconds: number): string {
  const source = StellarSdk.Keypair.random()
  const destination = StellarSdk.Keypair.random()
  const transaction = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(source.publicKey(), '1'),
    {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
      timebounds: {
        minTime: '0',
        maxTime: String(maxTimeSeconds),
      },
    },
  )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: destination.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: '1',
      }),
    )
    .build()
  transaction.sign(source)
  return transaction.toXDR()
}

const cleanups: Array<() => void> = []

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

describe('TransactionOutboxService', () => {
  it('keeps a signed transaction queued when submission loses connectivity', async () => {
    const repository = new MemoryOutboxRepository()
    const submitter = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const outbox = new TransactionOutboxService({
      repository,
      submitter,
      now: () => 1_000_000,
      online: () => true,
    })

    const item = await outbox.enqueueAndSubmit(buildTransaction(2_000), 'testnet')

    expect(item.status).toBe('queued')
    expect(item.attempts).toBe(1)
    expect(item.xdr).toBeTruthy()
    expect(submitter).toHaveBeenCalledTimes(1)
  })

  it('automatically retries queued transactions on the online event', async () => {
    const repository = new MemoryOutboxRepository()
    let online = false
    const submitter = vi.fn().mockResolvedValue({
      hash: 'confirmed-hash',
      ledger: 321,
      successful: true,
    })
    const outbox = new TransactionOutboxService({
      repository,
      submitter,
      now: () => 1_000_000,
      online: () => online,
    })
    const queued = await outbox.enqueueAndSubmit(buildTransaction(2_000), 'testnet')
    expect(queued.status).toBe('queued')

    cleanups.push(initializeTransactionOutbox(outbox))
    online = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(async () => {
      expect((await repository.get(queued.id))?.status).toBe('confirmed')
    })
    expect(submitter).toHaveBeenCalledTimes(1)
  })

  it('marks a transaction with elapsed time bounds expired and never submits it', async () => {
    const now = 2_000_000
    const xdr = buildTransaction(1_999)
    const submitter = vi.fn()
    const outbox = new TransactionOutboxService({
      repository: new MemoryOutboxRepository(),
      submitter,
      now: () => now,
      online: () => true,
    })

    expect(getTransactionExpiry(xdr, 'testnet')).toBe(1_999_000)
    const item = await outbox.enqueueAndSubmit(xdr, 'testnet')

    expect(item.status).toBe('expired')
    expect(item.error).toContain('time bound')
    expect(submitter).not.toHaveBeenCalled()
  })

  it('does not double-submit when automatic and manual retries overlap', async () => {
    const repository = new MemoryOutboxRepository()
    let online = false
    let resolveSubmission: ((_value: { hash: string; ledger: number }) => void) | undefined
    const submitter = vi.fn(
      () =>
        new Promise<{ hash: string; ledger: number }>((resolve) => {
          resolveSubmission = resolve
        }),
    )
    const outbox = new TransactionOutboxService({
      repository,
      submitter,
      now: () => 1_000_000,
      online: () => online,
    })
    const queued = await outbox.enqueueAndSubmit(buildTransaction(2_000), 'testnet')

    cleanups.push(initializeTransactionOutbox(outbox))
    online = true
    window.dispatchEvent(new Event('online'))
    const manualRetry = outbox.retry(queued.id)

    await vi.waitFor(() => expect(submitter).toHaveBeenCalledTimes(1))
    resolveSubmission?.({ hash: 'one-submission', ledger: 99 })
    await manualRetry

    expect(submitter).toHaveBeenCalledTimes(1)
    expect((await repository.get(queued.id))?.status).toBe('confirmed')
  })

  it('persists records between IndexedDB repository instances', async () => {
    const first = new IndexedDbOutboxRepository()
    const second = new IndexedDbOutboxRepository()
    const id = `testnet:persistence-${crypto.randomUUID()}`
    const item: TransactionOutboxItem = {
      id,
      xdr: 'signed-xdr',
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      status: 'queued',
      createdAt: 10,
      updatedAt: 10,
      attempts: 0,
      expiresAt: null,
    }

    await first.put(item)

    expect(await second.get(id)).toEqual(item)
    await second.deleteIfNotSubmitting(id)
  })
})
