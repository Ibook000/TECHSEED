// Admin session token handling. The token lives in sessionStorage only (written by
// AdminLoginPage) and is attached to API calls by installFetchAuth(), which is called
// once from main.tsx before the app mounts.
export const ADMIN_TOKEN_KEY = 'tech_admin_token';
export const ADMIN_USER_KEY = 'tech_admin_user';

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_USER_KEY);
  } catch {
    // ignore
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

// Wraps window.fetch so every /api/ request carries the admin token when one exists.
// The server's route whitelist remains the actual security boundary; this only
// guarantees the token is present so admin pages don't silently receive 401s.
export function installFetchAuth(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = requestUrl(input);
    const token = getAdminToken();
    const isApiCall = url.includes('/api/');

    if (isApiCall && token) {
      // Request objects are mutable — set the header in place rather than rebuilding.
      if (input instanceof Request) {
        input.headers.set('Authorization', `Bearer ${token}`);
        const response = originalFetch(input, init);
        return withAuthExpiryCheck(response, url);
      }

      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const response = originalFetch(url, { ...init, headers });
      return withAuthExpiryCheck(response, url);
    }

    return originalFetch(input, init);
  };
}

function withAuthExpiryCheck(response: Promise<Response> | Response, url: string): Response {
  // Only reachable when a token was attached, so a 401 here means the session died
  // rather than an anonymous caller hitting a protected route. Skip the login
  // endpoint: a 401 there just means the user typed a wrong password.
  Promise.resolve(response)
    .then((r) => {
      if (r.status !== 401 || url.includes('/api/auth/login')) return;
      clearAdminSession();
      alert('登录状态已失效，请重新登录管理后台');
      window.location.href = '/admin';
    })
    .catch(() => {});

  return response as Response;
}
