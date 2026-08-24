/**
 * Tests for QueryClient configuration helpers.
 *
 * Covers:
 *  - shouldRetry: respects AppError.retryable
 *  - shouldRetry: never retries AbortErrors
 *  - shouldRetry: stops at count >= 3
 *  - shouldRetry: rate-limit errors retry once then stop
 *  - shouldRetry: 4xx non-retryable HTTP errors
 *  - retryDelay: exponential backoff capped at 30 s
 */

import { shouldRetry, retryDelay } from '../queryClient'
import { AppError, ErrorCategory } from '../errorHandling'

describe('shouldRetry', () => {
  it('returns false when count >= 3', () => {
    expect(shouldRetry(3, new Error())).toBe(false)
    expect(shouldRetry(10, new Error())).toBe(false)
  })

  it('returns false for AbortError', () => {
    const abort = new DOMException('aborted', 'AbortError')
    expect(shouldRetry(0, abort)).toBe(false)
    expect(shouldRetry(1, abort)).toBe(false)
  })

  it('respects AppError.retryable=false', () => {
    const err = new AppError('not found', {
      category: ErrorCategory.NotFound,
      retryable: false,
    })
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('allows retry for retryable AppError', () => {
    const err = new AppError('server error', {
      category: ErrorCategory.ServerError,
      retryable: true,
    })
    expect(shouldRetry(0, err)).toBe(true)
    expect(shouldRetry(2, err)).toBe(true)
  })

  it('stops rate-limit retries after count 1', () => {
    const err = new AppError('rate limited', {
      category: ErrorCategory.RateLimit,
      retryable: true,
    })
    expect(shouldRetry(0, err)).toBe(true)
    expect(shouldRetry(1, err)).toBe(false)
  })

  it('returns false for 404 status codes', () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 })
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('returns false for general 4xx', () => {
    const err = Object.assign(new Error('bad request'), { statusCode: 400 })
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('returns true for 429 (rate limit HTTP)', () => {
    const err = Object.assign(new Error('too many requests'), { statusCode: 429 })
    expect(shouldRetry(0, err)).toBe(true)
  })

  it('returns true for generic errors', () => {
    expect(shouldRetry(0, new Error('network error'))).toBe(true)
    expect(shouldRetry(2, new Error('network error'))).toBe(true)
  })
})

describe('retryDelay', () => {
  it('returns 1000 ms for attempt 0', () => {
    expect(retryDelay(0)).toBe(1_000)
  })

  it('doubles for each attempt', () => {
    expect(retryDelay(1)).toBe(2_000)
    expect(retryDelay(2)).toBe(4_000)
  })

  it('caps at 30 000 ms', () => {
    expect(retryDelay(10)).toBe(30_000)
    expect(retryDelay(100)).toBe(30_000)
  })
})
