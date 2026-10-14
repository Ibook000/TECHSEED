import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isManualReviewResult } from '../server/services/manualReview.js';

test('accepts only explicit manual review decisions', () => {
  assert.equal(isManualReviewResult('PASSED'), true);
  assert.equal(isManualReviewResult('REJECTED'), true);
  assert.equal(isManualReviewResult(undefined), false);
  assert.equal(isManualReviewResult(null), false);
  assert.equal(isManualReviewResult('WAITLIST'), false);
  assert.equal(isManualReviewResult('passed'), false);
});
