export type ManualReviewResult = 'PASSED' | 'REJECTED';

export function isManualReviewResult(value: unknown): value is ManualReviewResult {
  return value === 'PASSED' || value === 'REJECTED';
}
