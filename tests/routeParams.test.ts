import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRouteParam } from '../server/services/routeParams.js';

test('accepts a single route parameter and fails closed for non-string values', () => {
  assert.equal(normalizeRouteParam('candidate-123'), 'candidate-123');
  assert.equal(normalizeRouteParam(undefined), '');
  assert.equal(normalizeRouteParam(null), '');
  assert.equal(normalizeRouteParam(['candidate-123', 'other']), '');
});
