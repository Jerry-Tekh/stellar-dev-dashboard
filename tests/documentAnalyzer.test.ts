import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/lib/documentAnalyzer';

describe('Document Analysis & Knowledge Extraction Engine', () => {
  it('extracts entities and calculates metrics from valid document text', () => {
    const doc = `
      # Soroban Smart Contract Architecture
      This guide details how to build and deploy Soroban smart contracts on the Stellar network using Rust and Wasm.
      ## Key Components
      - RPC Endpoints
      - Horizon Server
      - XDR Encoders
    `;

    const result = analyzeDocument(doc);

    expect(result.summary).toBe('Soroban Smart Contract Architecture');
    expect(result.category).toBe('Soroban Smart Contracts');
    expect(result.keyEntities).toContain('Soroban');
    expect(result.keyEntities).toContain('Stellar');
    expect(result.completenessScore).toBeGreaterThanOrEqual(80);
  });

  it('throws an error for empty string input', () => {
    expect(() => analyzeDocument('')).toThrow('Document content cannot be empty.');
  });
});
