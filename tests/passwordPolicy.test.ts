import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAdminPasswordLength,
  getAdminPasswordPolicyError,
  isAdminPasswordValid,
  MAX_ADMIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
} from '../src/lib/passwordPolicy.js';

test('counts Unicode characters instead of UTF-16 code units', () => {
  assert.equal(getAdminPasswordLength('密码🔒abcdefghij'), 13);
});

test('enforces password length and rejects all-whitespace values', () => {
  assert.equal(isAdminPasswordValid('a'.repeat(MIN_ADMIN_PASSWORD_LENGTH)), true);
  assert.equal(isAdminPasswordValid('a'.repeat(MIN_ADMIN_PASSWORD_LENGTH - 1)), false);
  assert.equal(isAdminPasswordValid('a'.repeat(MAX_ADMIN_PASSWORD_LENGTH + 1)), false);
  assert.equal(isAdminPasswordValid(' '.repeat(MIN_ADMIN_PASSWORD_LENGTH)), false);
  assert.match(getAdminPasswordPolicyError('short'), /至少需要 12 个字符/);
  assert.match(getAdminPasswordPolicyError(' '.repeat(MIN_ADMIN_PASSWORD_LENGTH)) ?? '', /不能只包含空白字符/);
  assert.equal(getAdminPasswordPolicyError('a'.repeat(MIN_ADMIN_PASSWORD_LENGTH)), null);
});
