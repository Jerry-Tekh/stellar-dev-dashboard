/**
 * Tests for query key factories.
 *
 * Ensures keys are stable, correctly shaped, and that partial
 * invalidation patterns (all-account vs specific account) work.
 */

import {
  accountKeys,
  transactionKeys,
  operationKeys,
  networkKeys,
  priceKeys,
  contractKeys,
} from '../queryKeys'

describe('accountKeys', () => {
  it('all key is a stable reference', () => {
    expect(accountKeys.all).toEqual(['account'])
  })

  it('byAddress includes address', () => {
    const key = accountKeys.byAddress('GADDR')
    expect(key).toEqual(['account', 'GADDR'])
  })

  it('detail includes address and network', () => {
    const key = accountKeys.detail('GADDR', 'testnet')
    expect(key).toEqual(['account', 'GADDR', 'testnet'])
  })

  it('createdAt key is distinct from detail', () => {
    const detail = accountKeys.detail('GADDR', 'testnet')
    const created = accountKeys.createdAt('GADDR', 'testnet')
    expect(created).not.toEqual(detail)
    expect(created).toHaveLength(4)
  })
})

describe('transactionKeys', () => {
  it('infinite key differs from page key', () => {
    const inf = transactionKeys.infinite('GADDR', 'mainnet', 50)
    const page = transactionKeys.page('GADDR', 'mainnet', 50)
    expect(inf).not.toEqual(page)
    expect(inf[3]).toBe('infinite')
    expect(page[3]).toBe('page')
  })

  it('detail key includes hash', () => {
    const key = transactionKeys.detail('abc123', 'testnet')
    expect(key).toContain('abc123')
  })
})

describe('operationKeys', () => {
  it('infinite key is structured correctly', () => {
    const key = operationKeys.infinite('GADDR', 'testnet', 20)
    expect(key[0]).toBe('operations')
    expect(key[3]).toBe('infinite')
    expect(key[4]).toBe(20)
  })
})

describe('networkKeys', () => {
  it('stats key includes network', () => {
    expect(networkKeys.stats('mainnet')).toContain('mainnet')
    expect(networkKeys.stats('testnet')).toContain('testnet')
  })

  it('stats keys differ by network', () => {
    expect(networkKeys.stats('mainnet')).not.toEqual(networkKeys.stats('testnet'))
  })
})

describe('priceKeys', () => {
  it('xlm key is stable', () => {
    expect(priceKeys.xlm()).toEqual(['prices', 'xlm'])
  })

  it('asset key includes code and issuer', () => {
    const key = priceKeys.asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
    expect(key).toContain('USDC')
    expect(key).toContain('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
  })
})

describe('contractKeys', () => {
  it('detail includes contractId and network', () => {
    const key = contractKeys.detail('CADDR', 'mainnet')
    expect(key).toContain('CADDR')
    expect(key).toContain('mainnet')
  })
})
