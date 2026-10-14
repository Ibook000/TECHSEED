export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const MAX_ADMIN_PASSWORD_LENGTH = 128;

export function getAdminPasswordLength(password: string): number {
  return Array.from(password).length;
}

export function isAdminPasswordValid(password: string): boolean {
  const length = getAdminPasswordLength(password);
  return password.trim().length > 0 && length >= MIN_ADMIN_PASSWORD_LENGTH && length <= MAX_ADMIN_PASSWORD_LENGTH;
}

export function getAdminPasswordPolicyError(password: string): string | null {
  if (password.trim().length === 0) return '管理员密码不能只包含空白字符';

  const length = getAdminPasswordLength(password);
  if (length < MIN_ADMIN_PASSWORD_LENGTH) return '管理员密码至少需要 12 个字符';
  if (length > MAX_ADMIN_PASSWORD_LENGTH) return '管理员密码不能超过 128 个字符';
  return null;
}
