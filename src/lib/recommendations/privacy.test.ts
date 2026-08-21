import { describe, expect, it } from 'vitest';
import {
  createPseudonymousId,
  looksSensitive,
  removeSensitiveInterests,
  sanitizeInterests,
} from './privacy';

describe('recommendation privacy helpers', () => {
  it('creates local identifiers unrelated to wallet addresses', () => {
    const first = createPseudonymousId(),
      second = createPseudonymousId();
    expect(first).toMatch(/^rec_/);
    expect(second).not.toBe(first);
  });
  it('normalizes and bounds feature vocabulary', () => {
    expect(sanitizeInterests([' Soroban ', 'soroban', 'DeFi tools!'])).toEqual([
      'soroban',
      'defi-tools-',
    ]);
    expect(
      sanitizeInterests(Array.from({ length: 40 }, (_, index) => `tag-${index}`))
    ).toHaveLength(24);
  });
  it('removes Stellar keys and suspicious long values', () => {
    const publicKey = `G${'A'.repeat(55)}`,
      secret = `S${'B'.repeat(55)}`;
    expect(looksSensitive(publicKey)).toBe(true);
    expect(looksSensitive(secret)).toBe(true);
    expect(removeSensitiveInterests(['xlm', publicKey, secret])).toEqual(['xlm']);
  });
});
