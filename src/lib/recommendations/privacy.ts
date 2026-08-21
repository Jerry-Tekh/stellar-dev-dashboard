const SAFE_INTEREST = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function createPseudonymousId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `rec_${crypto.randomUUID()}`;
  }
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function sanitizeInterests(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .slice(0, 32)
        )
        .filter((value) => SAFE_INTEREST.test(value))
    ),
  ].slice(0, 24);
}

export function looksSensitive(value: string): boolean {
  const trimmed = value.trim();
  return /^S[A-Z2-7]{55}$/.test(trimmed) || /^G[A-Z2-7]{55}$/.test(trimmed) || trimmed.length > 64;
}

export function removeSensitiveInterests(values: string[]): string[] {
  return sanitizeInterests(values.filter((value) => !looksSensitive(value)));
}
